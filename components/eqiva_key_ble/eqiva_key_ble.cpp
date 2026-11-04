#include "eqiva_key_ble.h"
#include "esphome/core/log.h"
#include <cinttypes>
#include "eQ3_util.h"
#include "eQ3_message.h"
#include <sstream>
#include <cmath>
#include <algorithm>
#include <cstring>
#include "esp_random.h"

#ifdef USE_ESP32

namespace esphome {
namespace eqiva_key_ble {


static const char *const TAG = "eqiva_key_ble";

// -----------------------------------------------------------------------------
// Patch: Watchdog statt "Retry nur beim nächsten Befehl"
// -----------------------------------------------------------------------------
void EqivaKeyBle::setup() {
  BLEClientBase::setup();
  if (this->simulate_) {
    // Simulation: kein BLE-Verbindungsaufbau, nur nachgebildetes Schloss
    this->set_auto_connect(false);
    ESP_LOGW(TAG, "SIMULATION aktiv - es wird kein echtes Schloss angesteuert");
    this->set_interval("eqiva_sim", 100, [this]() { this->sim_tick_(); });
    this->set_timeout("eqiva_sim_start", 1500, [this]() {
      this->sim_publish_state_(this->sim_state_);
      if (this->power_mode_ != POWER_ECO) this->sim_connect();
      else this->publish_(this->lock_ble_state_sensor_, "IDLE");
    });
    return;
  }
  // läuft über den Scheduler, also auch wenn BLEClientBase::loop() im IDLE deaktiviert ist
  this->set_interval("eqiva_watchdog", 500, [this]() { this->watchdog_(); });
}

// Patch: Für Verbindungsaufbau und Service Discovery den kürzesten Verbindungsabstand
// anfordern (7,5 ms). Die Discovery fragt viele Einträge nacheinander ab und war mit den
// ESP-IDF-Standardwerten der langsamste Teil (2–4 s). Nach dem Handshake setzt
// apply_conn_params_() den Abstand passend zum Energiemodus.
void EqivaKeyBle::connect() {
  this->set_conn_params_(6, 6, 0, 1000, "fast");   // 6 x 1,25 ms = 7,5 ms, Timeout 10 s
  BLEClientBase::connect();
}

void EqivaKeyBle::watchdog_() {
  const uint32_t now = millis();

  // 1) Zurückgehaltene Befehle verfallen lassen.
  //    Sonst würde z.B. ein "open" vom Fingerprint Minuten später ausgeführt,
  //    sobald die Verbindung irgendwann wieder steht.
  if (currentMsg != nullptr && (now - current_msg_time_) > command_timeout_) {
    ESP_LOGW(TAG, "Zurückgehaltene Nachricht 0x%02X nach %u ms verworfen (Schloss nicht erreichbar)",
             (uint8_t) currentMsg->id, (unsigned) command_timeout_);
    clear_pending_();
  }

  // Pairing-Anfrage nach 2 min verwerfen
  if (requestPair && (now - pair_started_) > 120000) {
    ESP_LOGW(TAG, "Pairing abgebrochen (2 min ohne Erfolg)");
    requestPair = false;
  }

  // Sparmodus: Status periodisch abfragen (baut dafür kurz eine Verbindung auf)
  if (power_mode_ == POWER_ECO && (!eco_poll_done_ || (now - last_eco_poll_) > eco_poll_interval_)) {
    eco_poll_done_ = true;
    last_eco_poll_ = now;
    ESP_LOGD(TAG, "Sparmodus: periodische Status-Abfrage");
    sendCommand(REQUEST_STATUS);
  }

  if (this->state() != espbt::ClientState::ESTABLISHED || write == nullptr)
    return;

  const bool idle = currentMsg == nullptr && sendQueue.empty() && sending == 0 && !sendingNonce && !requestPair;

  // Sparmodus: nach Leerlauf trennen und nicht automatisch neu verbinden
  if (power_mode_ == POWER_ECO && idle && (now - last_activity_) > idle_timeout_) {
    ESP_LOGI(TAG, "Sparmodus: %u s ohne Aktivität - trenne Verbindung", (unsigned) (idle_timeout_ / 1000));
    this->set_auto_connect(false);
    this->disconnect();
    return;
  }

  // Schnell/Ausgewogen: Verbindung mit Status-Abfrage am Leben halten
  if (power_mode_ != POWER_ECO && idle && !clientState.remote_session_nonce.empty() &&
      (now - last_activity_) > KEEPALIVE_MS) {
    ESP_LOGD(TAG, "Keepalive: Status-Abfrage");
    sendCommand(REQUEST_STATUS);
  }

  // RSSI der bestehenden Verbindung alle 15 s abfragen (Ergebnis kommt im GAP-Handler)
  if (rssi_sensor_ != nullptr && (now - last_rssi_read_) > 15000) {
    last_rssi_read_ = now;
    esp_err_t err = esp_ble_gap_read_rssi(this->remote_bda_);
    if (err != ESP_OK) {
      ESP_LOGV(TAG, "esp_ble_gap_read_rssi fehlgeschlagen: %d", err);
    }
  }

  // 2) Nonce-Austausch hängt -> erneut senden, nach mehreren Versuchen neu verbinden
  if (sendingNonce && (now - nonce_sent_time_) > SEND_TIMEOUT_MS) {
    if (++nonce_retries_ > MAX_NONCE_RETRIES) {
      ESP_LOGW(TAG, "Keine Nonce-Antwort nach %u Versuchen - baue Verbindung neu auf", MAX_NONCE_RETRIES);
      nonce_retries_ = 0;
      this->disconnect();   // auto_connect verbindet neu, zurückgehaltener Befehl bleibt bis Timeout erhalten
      return;
    }
    ESP_LOGI(TAG, "Nonce-Timeout, sende erneut (%u/%u)", nonce_retries_, MAX_NONCE_RETRIES);
    sendNonce();
    return;
  }

  // 3) Fragment-Write ohne Bestätigung -> Sperre lösen und weitermachen
  if (sending != 0 && (now - sending) > SEND_TIMEOUT_MS) {
    ESP_LOGW(TAG, "Write-Timeout, sende nächstes Fragment");
    sending = 0;
  }
  if (sending == 0 && !sendQueue.empty()) {
    sendFragment();
  }

  // 4) Session verloren (z.B. nach Auth-Fehler), aber Befehl wartet -> neu aushandeln
  if (currentMsg != nullptr && !sendingNonce && clientState.remote_session_nonce.empty()) {
    ESP_LOGI(TAG, "Keine Session, handle Nonce neu aus");
    init();
  }
}

void EqivaKeyBle::gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) {
  BLEClientBase::gap_event_handler(event, param);
  if (event == ESP_GAP_BLE_READ_RSSI_COMPLETE_EVT && rssi_sensor_ != nullptr &&
      this->check_addr(param->read_rssi_cmpl.remote_addr) &&
      param->read_rssi_cmpl.status == ESP_BT_STATUS_SUCCESS) {
    rssi_sensor_->publish_state(param->read_rssi_cmpl.rssi);
  }
  // Hinweis: Ergebnis von Verbindungsparameter-Änderungen loggt ESPHome selbst
  // (esp32_ble: "Conn param update failed" bzw. Erfolg), das Event wird nicht weitergereicht.
}

// -----------------------------------------------------------------------------
// Patch: Energiemodi
// -----------------------------------------------------------------------------
void EqivaKeyBle::set_power_mode(int mode) {
  if (mode < POWER_FAST || mode > POWER_ECO)
    mode = POWER_FAST;
  if (mode == power_mode_)
    return;
  static const char *const names[] = {"schnell", "ausgewogen", "sparsam"};
  ESP_LOGI(TAG, "Energiemodus: %s", names[mode]);
  power_mode_ = (uint8_t) mode;
  if (this->simulate_) {
    touch_();
    if (power_mode_ != POWER_ECO && !sim_connected_) this->sim_connect();
    return;
  }
  eco_poll_done_ = false;
  if (power_mode_ != POWER_ECO) {
    // Dauerverbindung: wieder automatisch verbinden
    this->set_auto_connect(true);
  }
  touch_();
  conn_params_applied_ = false;
  apply_conn_params_();
}

void EqivaKeyBle::set_balanced_interval_ms(uint32_t ms) {
  if (ms < 30) ms = 30;
  if (ms > 2000) ms = 2000;
  if (ms == balanced_interval_ms_)
    return;
  balanced_interval_ms_ = ms;
  if (power_mode_ == POWER_BALANCED) {
    conn_params_applied_ = false;
    apply_conn_params_();
  }
}

void EqivaKeyBle::apply_conn_params_() {
  if (conn_params_applied_ || this->state() != espbt::ClientState::ESTABLISHED)
    return;
  conn_params_applied_ = true;
  uint16_t min_int, max_int;   // Einheiten à 1,25 ms
  if (power_mode_ == POWER_BALANCED) {
    uint32_t u = balanced_interval_ms_ * 4 / 5;
    if (u < 6) u = 6;
    if (u > 3200) u = 3200;
    min_int = (uint16_t) u;
    max_int = (uint16_t) std::min<uint32_t>(u + u / 5, 3200);   // +20 % Spielraum für das Schloss
  } else {
    // schnell (und sparsam während der kurzen Verbindung): 30–50 ms
    min_int = 24;
    max_int = 40;
  }
  // Supervision Timeout (10-ms-Einheiten) muss deutlich größer als 2 x Intervall sein
  uint32_t timeout_ms = std::max<uint32_t>(4000, (uint32_t) (max_int * 1.25f * 8));
  if (timeout_ms > 32000) timeout_ms = 32000;

  esp_ble_conn_update_params_t p = {};
  memcpy(p.bda, this->remote_bda_, sizeof(esp_bd_addr_t));
  p.min_int = min_int;
  p.max_int = max_int;
  p.latency = 0;
  p.timeout = (uint16_t) (timeout_ms / 10);
  esp_err_t err = esp_ble_gap_update_conn_params(&p);
  if (err != ESP_OK) {
    ESP_LOGW(TAG, "esp_ble_gap_update_conn_params fehlgeschlagen: %d", err);
  } else {
    ESP_LOGD(TAG, "Fordere Verbindungsabstand %.1f-%.1f ms an", min_int * 1.25f, max_int * 1.25f);
  }
}

void EqivaKeyBle::request_connect_() {
  if (power_mode_ != POWER_ECO)
    return;
  const auto st = this->state();
  if (st == espbt::ClientState::ESTABLISHED || st == espbt::ClientState::CONNECTED ||
      st == espbt::ClientState::CONNECTING || st == espbt::ClientState::DISCOVERED)
    return;
  this->set_auto_connect(true);   // Fallback: Scanner verbindet, sobald das Schloss gesehen wird
  if (st == espbt::ClientState::IDLE && this->get_address() > 1) {
    // Direkt verbinden statt auf das nächste Scan-Ergebnis zu warten (spart mehrere Sekunden)
    ESP_LOGI(TAG, "Sparmodus: verbinde direkt für Befehl");
    connect_requested_at_ = millis();
    this->connect();
  } else {
    ESP_LOGI(TAG, "Sparmodus: verbinde für Befehl (über Scanner)");
  }
}

void EqivaKeyBle::reset_session_() {
  std::queue<eQ3Message::MessageFragment> empty;
  std::swap(sendQueue, empty);
  sending = 0;
  sendingNonce = false;
  nonce_retries_ = 0;
  clientState.remote_session_nonce.clear();
  clientState.local_session_nonce.clear();
}

void EqivaKeyBle::clear_pending_() {
  if (currentMsg != nullptr) {
    delete currentMsg;
    currentMsg = nullptr;
  }
}

// Nur EIN Platz für eine wartende Nachricht: Befehle (lock/unlock/open/pair/settings)
// haben Vorrang vor Status-Abfragen. Vorher überschrieb z.B. der 4-min-Status-Poll
// ein wartendes "open" (und leakte den Speicher).
void EqivaKeyBle::retain_(eQ3Message::Message *msg) {
  if (msg == currentMsg)
    return;
  if (currentMsg != nullptr) {
    const bool old_is_status = (uint8_t) currentMsg->id == MSG_ID_STATUS_REQUEST;
    const bool new_is_status = (uint8_t) msg->id == MSG_ID_STATUS_REQUEST;
    if (!old_is_status && new_is_status) {
      ESP_LOGD(TAG, "Status-Abfrage verworfen, Befehl wartet bereits");
      delete msg;
      return;
    }
    ESP_LOGD(TAG, "Ersetze wartende Nachricht 0x%02X durch 0x%02X", (uint8_t) currentMsg->id, (uint8_t) msg->id);
    delete currentMsg;
  }
  currentMsg = msg;
  current_msg_time_ = millis();
}

// -----------------------------------------------------------------------------

void EqivaKeyBle::dump_config() {
  ESP_LOGCONFIG(TAG, "Eqiva Key-BLE (patched v%s):", EQIVA_PATCH_VERSION);
  if (this->simulate_) {
    ESP_LOGCONFIG(TAG, "  *** SIMULATION - kein echtes Schloss ***");
    ESP_LOGCONFIG(TAG, "  Fahrzeit: %u ms", (unsigned) sim_travel_ms_);
    return;
  }
  ESP_LOGCONFIG(TAG, "  Address: %s", this->address_str());
  // Patch: Schlüssel nicht mehr im Klartext loggen
  ESP_LOGCONFIG(TAG, "  UserKey: %s", clientState.user_key.length() == 16 ? "gesetzt" : "fehlt/ungültig");
  ESP_LOGCONFIG(TAG, "  UserId: %d", clientState.user_id);
  ESP_LOGCONFIG(TAG, "  Command timeout: %u ms", (unsigned) command_timeout_);
}

bool EqivaKeyBle::gattc_event_handler(esp_gattc_cb_event_t event, esp_gatt_if_t esp_gattc_if,
                                    esp_ble_gattc_cb_param_t *param) {

  // Patch: nur bei Änderung veröffentlichen (vorher bei JEDEM GATT-Event)
  this->publish_(this->mac_address_sensor_, this->address_str());

  if (!BLEClientBase::gattc_event_handler(event, esp_gattc_if, param))
    return false;

  this->publish_(this->lock_ble_state_sensor_, getClientState());

  switch (event) {
    case ESP_GATTC_SEARCH_CMPL_EVT: {
      if (this->state() == espbt::ClientState::ESTABLISHED) {
        reset_session_();
        write = this->get_characteristic(esp32_ble_tracker::ESPBTUUID::from_raw("58e06900-15d8-11e6-b737-0002a5d5c51b"), esp32_ble_tracker::ESPBTUUID::from_raw("3141dd40-15db-11e6-a24b-0002a5d5c51b"));
        read = this->get_characteristic(esp32_ble_tracker::ESPBTUUID::from_raw("58e06900-15d8-11e6-b737-0002a5d5c51b"), esp32_ble_tracker::ESPBTUUID::from_raw("359d4820-15db-11e6-82bd-0002a5d5c51b"));
        // Patch: Null-Check, vorher Absturz wenn der Service nicht gefunden wurde
        if (write == nullptr || read == nullptr) {
          ESP_LOGE(TAG, "Eqiva-Characteristics nicht gefunden - trenne und verbinde neu");
          write = nullptr;
          read = nullptr;
          this->disconnect();
          break;
        }
        esp_err_t errRc = ::esp_ble_gattc_register_for_notify(
          this->gattc_if_,
          this->remote_bda_,
          read->handle
        );
        if (errRc != ESP_OK) {
          ESP_LOGW(TAG, "register_for_notify fehlgeschlagen: %d", errRc);
        }

        touch_();
        init();
        if (currentMsg == nullptr && requestPair == false && clientState.user_key.length() > 0 && (uint8_t) clientState.user_id < 255) {
          auto * msg = new eQ3Message::StatusRequestMessage;
          sendMessage(msg, false);
        }

      }
      break;
    }
    case ESP_GATTC_DISCONNECT_EVT:
    case ESP_GATTC_CLOSE_EVT: {
      ESP_LOGD(TAG, "ESP_GATTC_DISCONNECT_EVT / CLOSE_EVT");
      // Patch: Session + Queue verwerfen. Vorher blieben alte, mit der alten Nonce
      // verschlüsselte Fragmente in der Queue und wurden nach dem Reconnect gesendet.
      reset_session_();
      write = nullptr;   // Services werden von BLEClientBase freigegeben -> Zeiger ungültig
      read = nullptr;
      conn_params_applied_ = false;
      // Im Sparmodus ist "getrennt" der Normalzustand -> letzten Empfangswert behalten
      if (power_mode_ != POWER_ECO && rssi_sensor_ != nullptr && !std::isnan(rssi_sensor_->state))
        rssi_sensor_->publish_state(NAN);   // "nicht verbunden"
      break;
    }
    case ESP_GATTC_SEARCH_RES_EVT: {
      ESP_LOGV(TAG, "ESP_GATTC_SEARCH_RES_EVT");
      break;
    }
    case ESP_GATTC_WRITE_CHAR_EVT: {
      if (param != nullptr && param->write.status != ESP_GATT_OK) {
        // Patch: fehlgeschlagener Write -> Nachricht unvollständig, Session neu aushandeln
        ESP_LOGW(TAG, "Write fehlgeschlagen (status %d) - handle Session neu aus", param->write.status);
        reset_session_();
        init();
        break;
      }
      if (sending != 0) {
        ESP_LOGD(TAG, "Write ok nach %u ms", (unsigned) (millis() - sending));
      }
      sending = 0;
      sendFragment();
      break;
    }
    case ESP_GATTC_WRITE_DESCR_EVT: {
      ESP_LOGV(TAG, "ESP_GATTC_WRITE_DESCR_EVT");
      break;
    }
    case ESP_GATTC_NOTIFY_EVT: {
      ESP_LOGD(TAG, "ESP_GATTC_NOTIFY_EVT");
      sending = 0;
      touch_();
      if (param != nullptr) {

        eQ3Message::MessageFragment frag;

        frag.data = std::string((char *) param->notify.value, param->notify.value_len);
        if (frag.data.empty()) {
          break;
        }
        auto msgtype = frag.getType();
        if (!frag.isLast()) {
          // Mehrteilige Antworten werden (wie upstream) nicht zusammengesetzt
          ESP_LOGW(TAG, "Mehrteilige Antwort empfangen - nicht unterstützt");
        }
        std::string msgdata = frag.getData();
        if (eQ3Message::Message::isTypeSecure(msgtype)) {
          if (msgdata.length() < 7) {
            ESP_LOGW(TAG, "Sichere Nachricht zu kurz (%u)", (unsigned) msgdata.length());
            break;
          }
          // Patch: Bytes explizit als unsigned lesen. Vorher wurde auf Plattformen mit
          // signed char (ESP32/Xtensa) ab Zählerstand 0x80 ein falscher Zähler berechnet.
          uint16_t msg_security_counter =
              (uint16_t) (((uint8_t) msgdata[msgdata.length() - 6]) << 8) |
              (uint8_t) msgdata[msgdata.length() - 5];
          if (msg_security_counter <= clientState.remote_security_counter) {
              ESP_LOGW(TAG, "Remote security counter mismatch (%u <= %u)", msg_security_counter, clientState.remote_security_counter);
              sendFragment();
              return true;
          }
          clientState.remote_security_counter = msg_security_counter;
          std::string msg_auth_value = msgdata.substr(msgdata.length() - 4, 4);
          std::string decrypted = crypt_data(msgdata.substr(1, msgdata.length() - 7), msgtype, clientState.local_session_nonce, clientState.remote_security_counter, clientState.user_key);
          std::string computed_auth_value = compute_auth_value(decrypted, msgtype, clientState.local_session_nonce, clientState.remote_security_counter, clientState.user_key);
          if (msg_auth_value != computed_auth_value) {
              ESP_LOGE(TAG, "Auth value mismatch - falscher User Key/ID? Session wird neu ausgehandelt");
              clientState.remote_session_nonce.clear();
              clientState.remote_security_counter = 0;
              return true;
          }
          if(clientState.card_key.length() > 0 && (uint8_t) clientState.user_id != 255) {
            ESP_LOGI(TAG, "Pairing erfolgreich, user_id: %d (user_key steht im Text-Sensor)", clientState.user_id);
            ESP_LOGV(TAG, "user_key: %s", string_to_hex(clientState.user_key).c_str());
            clientState.card_key.clear();
            const int uid = (uint8_t) clientState.user_id;
            for (auto *t : paired_triggers_)
              t->trigger(uid);   // Patch: on_paired-Automation (z. B. Pairing-Info speichern)
          }
          msgdata = decrypted;
          ESP_LOGV(TAG, "Decrypted: %s", string_to_hex(msgdata).c_str());

        }
        switch ((uint8_t) msgtype) {
          case 0x00: {
              ESP_LOGD(TAG, "Case 0");
              break;
          }

          case 0x81: // answer with security
              ESP_LOGD(TAG, "Case 0x81");
              break;

          case 0x01: // answer without security
              ESP_LOGD(TAG, "Case 0x01");
              break;

          case 0x05: {
              ESP_LOGD(TAG, "Case 0x05 (status changed)");
              auto * message = new eQ3Message::StatusRequestMessage;
              sendMessage(message, false);
              break;
          }

          case 0x03: {
              // Nonce success
              ESP_LOGD(TAG, "Case 0x03");
              eQ3Message::Connection_Info_Message message;
              message.data = msgdata;
              clientState.user_id = message.getUserId();
              clientState.remote_session_nonce = message.getRemoteSessionNonce();
              clientState.local_security_counter = 1;
              clientState.remote_security_counter = 0;
              if (clientState.remote_session_nonce.length() == 8) {
                ESP_LOGD(TAG,"Nonce exchanged, remote user_id: %d", clientState.user_id);
              } else {
                ESP_LOGE(TAG,"Ungültige Nonce empfangen (%u Bytes)", (unsigned) clientState.remote_session_nonce.length());
              }

              const uint8_t uid = (uint8_t) message.getUserId();
              sendingNonce = false;
              nonce_retries_ = 0;

              if (uid == 255) {
                // Patch: Schloss kennt diesen Benutzer nicht (bzw. vergibt im Pairing keine ID).
                if (requestPair) {
                  ESP_LOGW(TAG, "Schloss ist nicht im Pairing-Modus - Öffnen-Taste ca. 5 s halten, bis die LED schnell orange blinkt. "
                                "Neuer Versuch bei der nächsten Verbindung.");
                  this->disconnect();
                } else {
                  ESP_LOGE(TAG, "ESP ist am Schloss nicht (mehr) angelernt (user_id 255). Bitte neu pairen. "
                                "Automatisches Verbinden pausiert, um die Schloss-Batterie zu schonen.");
                  clear_pending_();
                  this->set_auto_connect(false);   // wird durch Pair/Connect wieder aktiviert
                  this->disconnect();
                }
                break;
              }

              this->publish_(this->user_key_sensor_, string_to_hex(clientState.user_key));
              this->publish_(this->user_id_sensor_, std::to_string(uid));

              if (connect_requested_at_ != 0) {
                ESP_LOGI(TAG, "Sparmodus: Verbindung + Session nach %u ms bereit", (unsigned) (millis() - connect_requested_at_));
                connect_requested_at_ = 0;
              }
              if (requestPair) {
                // Patch: Pairing hat Vorrang. Vorher konnte ein wartender Status-Poll
                // das Pairing blockieren (else-if-Zweig wurde nie erreicht).
                requestPair = false;
                clear_pending_();
                ESP_LOGI(TAG, "Schloss hat user_id %u vergeben, sende Pairing-Anfrage", uid);
                finishPair();
              } else if (currentMsg != nullptr) {
                auto *pending = currentMsg;
                currentMsg = nullptr;           // Patch: Besitz übergeben, kein Doppel-delete
                sendMessage(pending, false);
              }
              apply_conn_params_();             // Patch: Verbindungsabstand je nach Energiemodus
              break;
          }

          case 0x83: {
              ESP_LOGD(TAG, "Case 0x83");
              // status info
              eQ3Message::Status_Info_Message message;
              message.data = msgdata;
              std::string lockStatus;
              switch(message.getLockStatus()) {
                case 0: lockStatus = "UNKNOWN"; break;
                case 1: lockStatus = "MOVING"; break;
                case 2: lockStatus = "UNLOCKED"; break;
                case 3: lockStatus = "LOCKED"; break;
                case 4: lockStatus = "OPENED"; break;
                default: lockStatus = "UNKNOWN"; break;
              }
              // Lock-Status bewusst immer veröffentlichen (on_value-Automationen)
              if (this->lock_status_sensor_ != nullptr)
                this->lock_status_sensor_->publish_state(lockStatus);
              this->publish_(this->low_battery_sensor_, message.isBatteryLow() ? "true" : "false");

              ESP_LOGD(TAG, "# Lock state: %d, battery low: %s", message.getLockStatus(), message.isBatteryLow() ? "true" : "false");
              break;
          }

          default: {
              ESP_LOGD(TAG, "Case default 0x%02X", (uint8_t) msgtype);
              break;
          }
        }
        sendFragment();
      }
      break;
    }
    default: {
      ESP_LOGV(TAG, "OTHER EVENT %d", static_cast<int>(event));
      break;
    }
  }
  return true;
}

void EqivaKeyBle::init() {
    if(clientState.user_key.length() == 16) {
      sendNonce();
    } else {
      // Patch: Schlüssel nicht loggen
      ESP_LOGE(TAG, "User Key fehlt/ungültig (%u statt 16 Bytes), ID: %d", (unsigned) clientState.user_key.length(), clientState.user_id);
    }
}

void EqivaKeyBle::sendCommand(CommandType command) {
  if (this->simulate_) {
    // Befehle haben Vorrang vor Status-Abfragen (wie beim echten Schloss)
    if (!(command == REQUEST_STATUS && sim_pending_ >= 0 && sim_pending_ != REQUEST_STATUS)) {
      sim_pending_ = (int) command;
      sim_pending_since_ = millis();
    }
    touch_();
    if (!sim_connected_) this->sim_connect();
    return;
  }
  if (command == REQUEST_STATUS) {
      auto * msg = new eQ3Message::StatusRequestMessage;
      sendMessage(msg, false);
  } else {
      auto msg = new eQ3Message::CommandMessage((char) command);
      sendMessage(msg, false);
  }
}

void EqivaKeyBle::applySettings() {
    if (this->simulate_) { ESP_LOGI(TAG, "Simulation: Einstellungen übernommen"); return; }
    auto * msg = new eQ3Message::Mount_Options_Set_Message;
    sendMessage(msg, false);
}

void EqivaKeyBle::startPair() {
    if (clientState.card_key.length() > 0) {
      clientState.user_id = 255;
      clientState.user_key.clear();
      clientState.remote_session_nonce.clear();
      // Patch: echter Zufall (Hardware-RNG) über 16 volle Bytes.
      // Vorher: rand() mit srand(time(NULL)) -> Seed = Sekunden seit Boot bzw. Uhrzeit,
      // nur [0-9a-z] -> Schlüssel erratbar.
      uint8_t key[16];
      esp_fill_random(key, sizeof(key));
      clientState.user_key = std::string((char *) key, sizeof(key));
      pair_started_ = millis();
      ESP_LOGI(TAG, "Bitte Öffnen-Taste am Schloss 5 s halten (Pairing-Modus)");
      ESP_LOGI(TAG, "Pairing wird versucht...");
      init();
      finishPair();
    } else {
      ESP_LOGW(TAG, "Card key fehlt oder ungültig!");
    }

}

void EqivaKeyBle::finishPair() {
    if (sendingNonce == false && clientState.remote_session_nonce.length() > 0) {
      auto *message = new eQ3Message::PairingRequestMessage();
      message->data.append(1, clientState.user_id);
      std::string cardKey = hexstring_to_string(clientState.card_key);
      std::string encrypted_pair_key = crypt_data(clientState.user_key, 0x04, clientState.remote_session_nonce, clientState.local_security_counter, cardKey);
      if (encrypted_pair_key.length() < 22)
          encrypted_pair_key.append(22 - encrypted_pair_key.length(), 0);
      message->data.append(encrypted_pair_key);

      // counter
      message->data.append(1, (char) (clientState.local_security_counter >> 8));
      message->data.append(1, (char) (clientState.local_security_counter));

      // auth value
      std::string  extra;
      extra.append(1, clientState.user_id);
      extra.append(clientState.user_key);
      if (extra.length() < 23)
          extra.append(23 - extra.length(), 0);
      std::string auth_value = compute_auth_value(extra, 0x04, clientState.remote_session_nonce, clientState.local_security_counter, cardKey);
      message->data.append(auth_value);
      sendMessage(message, false);
    } else {
      requestPair = true;
    }
  }

void EqivaKeyBle::sendNonce() {
    // Patch: Nonce nur senden, wenn verbunden. Nach dem Verbinden ruft
    // SEARCH_CMPL ohnehin init() auf.
    if (this->state() != espbt::ClientState::ESTABLISHED || write == nullptr) {
      sendingNonce = false;
      return;
    }
    // alte, halb gesendete Fragmente verwerfen
    std::queue<eQ3Message::MessageFragment> empty;
    std::swap(sendQueue, empty);
    sending = 0;

    sendingNonce = true;
    nonce_sent_time_ = millis();
    clientState.local_session_nonce.clear();
    for (int i = 0; i < 8; i++)
        clientState.local_session_nonce.append(1, (char) esp_random());

    auto *noncemsg = new eQ3Message::Connection_Request_Message;
    sendMessage(noncemsg, true);
}

bool EqivaKeyBle::sendMessage(eQ3Message::Message *msg, bool nonce) {
    const bool connected = this->state() == espbt::ClientState::ESTABLISHED && write != nullptr;
    const bool session_ok = sendingNonce == false && clientState.remote_session_nonce.length() > 0;

    if (connected && (session_ok || nonce)) {
      ESP_LOGD(TAG, "Sende Nachricht 0x%02X", (uint8_t) msg->id);
      std::string data;
      if (msg->isSecure()) {
          std::string padded_data;
          padded_data.append(msg->encode(&clientState));
          int pad_to = generic_ceil(padded_data.length(), 15, 8);
          if (pad_to > padded_data.length())
              padded_data.append(pad_to - padded_data.length(), 0);
          data.append(1, msg->id);
          data.append(crypt_data(padded_data, msg->id, clientState.remote_session_nonce, clientState.local_security_counter, clientState.user_key));
          data.append(1, (char) (clientState.local_security_counter >> 8));
          data.append(1, (char) clientState.local_security_counter);
          data.append(compute_auth_value(padded_data, msg->id, clientState.remote_session_nonce, clientState.local_security_counter, clientState.user_key));
          clientState.local_security_counter++;
      } else {
          data.append(1, msg->id);
          data.append(msg->encode(&clientState));
      }

      // fragment
      int chunks = data.length() / 15;
      if (data.length() % 15 > 0)
          chunks += 1;

      for (int i = 0; i < chunks; i++) {
          eQ3Message::MessageFragment frag;
          frag.data.append(1, (i ? 0 : 0x80) + (chunks - 1 - i)); // fragment status byte
          frag.data.append(data.substr(i * 15, 15));
          if (frag.data.length() < 16)
              frag.data.append(16 - (frag.data.length() % 16), 0);  // padding
          sendQueue.push(frag);
      }
      sendFragment();
      touch_();
      delete msg;   // Patch: vorher free() auf mit new erzeugtes Objekt (undefiniert + Leak)
      return true;
    }

    // Nicht sendebereit -> zurückhalten; Watchdog/Reconnect kümmern sich darum
    if (!connected) {
      ESP_LOGI(TAG, "Halte Nachricht 0x%02X zurück: Schloss nicht verbunden", (uint8_t) msg->id);
    } else if (sendingNonce) {
      ESP_LOGD(TAG, "Halte Nachricht 0x%02X zurück: Nonce-Austausch läuft", (uint8_t) msg->id);
    } else {
      ESP_LOGI(TAG, "Halte Nachricht 0x%02X zurück: keine Session, starte Nonce", (uint8_t) msg->id);
    }
    retain_(msg);
    if (!connected) {
      request_connect_();   // Sparmodus: Verbindung bei Bedarf aufbauen
    }
    if (connected && !sendingNonce && clientState.remote_session_nonce.empty()) {
      init();
    }
    return false;
}

void EqivaKeyBle::sendFragment() {
    const uint32_t now = millis();
    if (sendQueue.empty() || this->state() != espbt::ClientState::ESTABLISHED || write == nullptr) {
      return;
    }
    if (sending != 0 && (now - sending) <= SEND_TIMEOUT_MS) {
      return;   // vorheriges Fragment noch unterwegs
    }

    sending = now == 0 ? 1 : now;
    std::string data = sendQueue.front().data;
    sendQueue.pop();
    ESP_LOGV(TAG, "Sende Fragment");
    auto err = write->write_value((uint8_t *) (data.c_str()), 16, ESP_GATT_WRITE_TYPE_RSP);
    if (err != ESP_OK) {
      ESP_LOGW(TAG, "write_value fehlgeschlagen: %d", err);
      sending = 0;
    }
}


}  // namespace eqiva_key_ble
}  // namespace esphome

// -----------------------------------------------------------------------------
// Simulation: bildet das Schloss nach, damit Fingerprint, Zeitplan und LEDs ohne
// echtes Schloss getestet werden können. Verhalten wie das echte Schloss:
// - Lock-Status wird bei jeder Antwort veröffentlicht (auch unverändert)
// - Sparsam: Verbindung erst bei Bedarf (ca. 2 s), Trennen nach Leerlauf
// - Befehle verfallen nach command_timeout, wenn das Schloss "nicht erreichbar" ist
// -----------------------------------------------------------------------------
namespace esphome {
namespace eqiva_key_ble {

static const char *const SIM_TAG = "eqiva_sim";

void EqivaKeyBle::sim_publish_state_(uint8_t st) {
  static const char *const names[] = {"UNKNOWN", "MOVING", "UNLOCKED", "LOCKED", "OPENED"};
  if (this->lock_status_sensor_ != nullptr)
    this->lock_status_sensor_->publish_state(names[st <= 4 ? st : 0]);
  this->publish_(this->low_battery_sensor_, "false");
}

void EqivaKeyBle::sim_set_connected_(bool c) {
  sim_connected_ = c;
  sim_connecting_ = false;
  this->publish_(this->lock_ble_state_sensor_, c ? "ESTABLISHED" : "IDLE");
  if (rssi_sensor_ != nullptr)
    rssi_sensor_->publish_state(c ? -60.0f : NAN);
}

void EqivaKeyBle::sim_connect() {
  if (sim_connected_ || sim_connecting_)
    return;
  sim_connecting_ = true;
  sim_conn_ready_ = millis() + 2000;   // simulierter Verbindungsaufbau
  touch_();
  this->publish_(this->lock_ble_state_sensor_, "CONNECTING");
  ESP_LOGI(SIM_TAG, "Simulation: verbinde ...");
}

void EqivaKeyBle::sim_disconnect() {
  if (!sim_connected_ && !sim_connecting_)
    return;
  ESP_LOGI(SIM_TAG, "Simulation: Verbindung getrennt");
  sim_set_connected_(false);
}

void EqivaKeyBle::sim_execute_(int cmd) {
  static const char *const cmds[] = {"zuschließen", "aufschließen", "öffnen", "Status"};
  ESP_LOGI(SIM_TAG, "Simulation: %s", cmds[(cmd >= 0 && cmd <= 3) ? cmd : 3]);
  touch_();
  uint8_t target = 0;
  if (cmd == LOCK) target = 3;
  else if (cmd == UNLOCK) target = 2;
  else if (cmd == OPEN) target = 4;
  if (target == 0 || (sim_target_ == 0 && target == sim_state_)) {
    sim_publish_state_(sim_target_ != 0 ? 1 : sim_state_);   // Status bzw. schon im Zielzustand
    return;
  }
  sim_target_ = target;
  sim_move_end_ = millis() + sim_travel_ms_;
  sim_publish_state_(1);   // MOVING
}

void EqivaKeyBle::sim_tick_() {
  const uint32_t now = millis();
  // Verbindungsaufbau
  if (sim_connecting_ && sim_reachable_ && (int32_t) (now - sim_conn_ready_) >= 0) {
    ESP_LOGI(SIM_TAG, "Simulation: verbunden");
    sim_set_connected_(true);
  }
  // Wartender Befehl
  if (sim_pending_ >= 0) {
    if (sim_connected_) {
      const int cmd = sim_pending_;
      sim_pending_ = -1;
      sim_execute_(cmd);
    } else if ((now - sim_pending_since_) > command_timeout_) {
      ESP_LOGW(SIM_TAG, "Simulation: Befehl verworfen (Schloss nicht erreichbar)");
      sim_pending_ = -1;
      if (sim_connecting_) {
        sim_connecting_ = false;
        this->publish_(this->lock_ble_state_sensor_, "IDLE");
      }
    }
  }
  // Motorfahrt
  if (sim_target_ != 0 && (int32_t) (now - sim_move_end_) >= 0) {
    if (sim_target_ == 4) {
      sim_publish_state_(4);   // OPENED, danach wie beim echten Schloss UNLOCKED
      sim_state_ = 2;
      sim_target_ = 2;
      sim_move_end_ = now + 1500;
    } else {
      sim_state_ = sim_target_;
      sim_target_ = 0;
      sim_publish_state_(sim_state_);
    }
    touch_();
  }
  // Sparmodus: nach Leerlauf trennen
  // millis() neu lesen: touch_() oben kann last_activity_ nach "now" gesetzt haben (sonst Unterlauf)
  if (power_mode_ == POWER_ECO && sim_connected_ && sim_target_ == 0 && sim_pending_ < 0 &&
      (millis() - last_activity_) > idle_timeout_) {
    ESP_LOGI(SIM_TAG, "Simulation (Sparmodus): %u s ohne Aktivität - trenne", (unsigned) (idle_timeout_ / 1000));
    sim_set_connected_(false);
  }
  // Schaltet man "nicht erreichbar" während einer Verbindung -> trennen
  if (!sim_reachable_ && sim_connected_) {
    ESP_LOGW(SIM_TAG, "Simulation: Schloss nicht mehr erreichbar");
    sim_set_connected_(false);
  }
  // Wieder erreichbar und Dauerverbindung gewünscht -> verbinden
  if (sim_reachable_ && !sim_connected_ && !sim_connecting_ && power_mode_ != POWER_ECO)
    this->sim_connect();
}

}  // namespace eqiva_key_ble
}  // namespace esphome

#endif
