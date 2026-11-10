#include "eqiva_key_ble.h"
#include "esphome/core/log.h"
#include <cinttypes>
#include "eQ3_util.h"
#include "eQ3_message.h"
#include <sstream>
#include <cmath>
#include <algorithm>
#include <cstring>
#include <ctime>
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
  this->set_interval("eqiva_events", 1000, [this]() { this->ev_tick_(); });
  this->publish_events_();
  if (this->simulate_) {
    // Simulation: kein BLE-Verbindungsaufbau, nur nachgebildetes Schloss
    this->set_auto_connect(false);
    ESP_LOGW(TAG, "SIMULATION aktiv - es wird kein echtes Schloss angesteuert");
    this->set_interval("eqiva_sim", 100, [this]() { this->sim_tick_(); });
    this->set_timeout("eqiva_sim_start", 1500, [this]() {
      this->sim_publish_state_(this->sim_state_);
      if (this->power_mode_ != POWER_ECO) this->sim_connect();
      else this->publish_ble_state_("IDLE");
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
    this->ev_fail_("Schloss nicht erreichbar");
    // Bluetooth-Status: kam der Verbindungsaufbau gar nicht zustande -> nicht gefunden, sonst Fehler
    ble_fail_ = attempt_open_error_ ? "Verbindungsfehler" : "Schloss nicht gefunden";
    this->update_ble_status_();
  }

  // Pairing nach 60 s ohne Bestätigung abbrechen, bisherige Kopplung wiederherstellen
  if ((requestPair || pair_pending_) && (now - pair_started_) > 60000) {
    this->pair_restore_("keine Bestätigung vom Schloss innerhalb von 60 s");
  }

  // Sparmodus: Status periodisch abfragen (baut dafür kurz eine Verbindung auf)
  if (power_mode_ == POWER_ECO && clientState.user_key.length() == 16 &&   // nur wenn gekoppelt
      (!eco_poll_done_ || (now - last_eco_poll_) > eco_poll_interval_)) {
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

  this->publish_ble_state_(getClientState());

  switch (event) {
    case ESP_GATTC_OPEN_EVT: {
      if (param->open.status != ESP_GATT_OK && param->open.status != ESP_GATT_ALREADY_OPEN)
        this->conn_fail_();
      break;
    }
    case ESP_GATTC_SEARCH_CMPL_EVT: {
      if (this->state() == espbt::ClientState::ESTABLISHED) {
        this->conn_ok_();
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
            // Erst jetzt neuen Schlüssel und User-ID melden (werden in der YAML gespeichert)
            pair_pending_ = false;
            prev_user_key_.clear();
            this->publish_(this->user_key_sensor_, string_to_hex(clientState.user_key));
            this->publish_(this->user_id_sensor_, std::to_string(uid));
            for (auto *t : paired_triggers_)
              t->trigger(uid);   // Patch: on_paired-Automation (z. B. Pairing-Info speichern)
            this->log_event("🔗 Gekoppelt (User " + std::to_string(uid) + ")");
            // Schlosszustand gleich abfragen, damit Einrichtungsstatus/App sofort stimmen
            this->set_timeout("eqiva_post_pair", 1500, [this]() { this->sendCommand(REQUEST_STATUS); });
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
                } else if (pair_pending_) {
                  // Neuer Schlüssel wurde nicht bestätigt (Pairing-Modus vorbei): alte Kopplung zurück
                  this->pair_restore_("Schloss hat das Pairing nicht bestätigt (Pairing-Modus vorbei?)");
                } else {
                  ESP_LOGE(TAG, "ESP ist am Schloss nicht (mehr) angelernt (user_id 255). Bitte neu pairen. "
                                "Automatisches Verbinden pausiert, um die Schloss-Batterie zu schonen.");
                  clear_pending_();
                  this->set_auto_connect(false);   // wird durch Pair/Connect wieder aktiviert
                  this->disconnect();
                }
                break;
              }

              if (!pair_pending_) {   // während des Pairings erst nach Bestätigung melden
                this->publish_(this->user_key_sensor_, string_to_hex(clientState.user_key));
                this->publish_(this->user_id_sensor_, std::to_string(uid));
              }

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
              this->on_lock_state_(message.getLockStatus());

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
  // Neuer Befehl = neuer Versuch: angezeigten Bluetooth-Fehler zurücksetzen
  if (!ble_fail_.empty() || attempt_open_error_) { ble_fail_.clear(); attempt_open_error_ = false; this->update_ble_status_(); }
  if (command == LOCK || command == UNLOCK || command == OPEN) {
    // Ereignisprotokoll: Auslöser merken, Bestätigung kommt über den Status
    const uint32_t now = millis();
    const bool src_ok = !cmd_source_.empty() && (now - cmd_source_at_) < 3000;
    ev_pending_ = (int) command;
    ev_pending_src_ = src_ok ? cmd_source_ : std::string("HA/Web");
    ev_pending_at_ = now;
    ev_moved_ = false;
    reaction_started_ = now;
    reaction_pending_ = true;
    reaction_act_ = command == LOCK ? 'z' : (command == UNLOCK ? 'a' : 'o');
    reaction_src_ = ev_pending_src_.substr(0, 16);
    ev_reaction_ms_ = 0;
    ev_open_unlocked_ = false;
    cmd_source_.clear();
  }
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
      // Bisherige Kopplung merken: Sie gilt weiter, bis das Schloss das neue Pairing bestätigt
      pair_pending_ = true;
      prev_user_key_ = clientState.user_key.length() == 16 ? clientState.user_key : std::string();
      prev_user_id_ = clientState.user_id;
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
  this->on_lock_state_(st <= 4 ? st : 0);
}

void EqivaKeyBle::sim_set_connected_(bool c) {
  if (c) this->conn_ok_();
  sim_connected_ = c;
  sim_connecting_ = false;
  this->publish_ble_state_(c ? "ESTABLISHED" : "IDLE");
  if (rssi_sensor_ != nullptr)
    rssi_sensor_->publish_state(c ? -60.0f : NAN);
}

void EqivaKeyBle::sim_connect() {
  if (sim_connected_ || sim_connecting_)
    return;
  sim_connecting_ = true;
  sim_conn_ready_ = millis() + 2000;   // simulierter Verbindungsaufbau
  touch_();
  this->publish_ble_state_("CONNECTING");
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

void EqivaKeyBle::sim_turn_by_hand() {
  if (!simulate_ || sim_target_ != 0) return;
  ESP_LOGI(SIM_TAG, "Simulation: von Hand gedreht");
  sim_target_ = sim_state_ == 3 ? 2 : 3;
  sim_move_end_ = millis() + 1500;
  sim_publish_state_(1);
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
      this->conn_fail_(true);
      this->ev_fail_("Schloss nicht erreichbar");
      if (sim_connecting_) {
        sim_connecting_ = false;
        this->publish_ble_state_("IDLE");
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

// ---------------------------------------------------------------
// Ereignisprotokoll: wer hat wann auf-/zugeschlossen, Hand-Bedienung,
// fehlgeschlagene Befehle. Weitere Einträge (Klingel, Sabotage …) kommen
// über log_event() aus den YAML-Paketen.
// ---------------------------------------------------------------
static const char *const EV_TAG = "eqiva_event";

void EqivaKeyBle::log_event(const std::string &text) { this->log_event_at_(text, ::time(nullptr)); }

void EqivaKeyBle::log_event_at_(const std::string &text, time_t t) {
  if (t < 1600000000) t = 0;             // Uhrzeit noch unbekannt
  ESP_LOGI(EV_TAG, "%s", text.c_str());
  events_.push_front({t, text});
  while (events_.size() > 10) events_.pop_back();
  this->publish_events_();
}

void EqivaKeyBle::publish_events_() {
  if (this->events_sensor_ == nullptr) return;
  // Heute nur Uhrzeit, ältere Einträge mit Datum
  time_t now = ::time(nullptr);
  struct tm today {};
  const bool now_ok = now > 1600000000 && localtime_r(&now, &today) != nullptr;
  // Home Assistant erlaubt max. 255 Zeichen je Zustand -> ältere Einträge ggf. weglassen
  auto chars = [](const std::string &s) {
    size_t n = 0;
    for (unsigned char ch : s) if ((ch & 0xC0) != 0x80) n++;
    return n;
  };
  std::string out;
  size_t len = 0;
  for (const auto &e : events_) {
    char ts[20] = "";
    struct tm lt;
    if (e.t != 0 && localtime_r(&e.t, &lt) != nullptr) {
      const bool same_day = now_ok && lt.tm_yday == today.tm_yday && lt.tm_year == today.tm_year;
      strftime(ts, sizeof(ts), same_day ? "%H:%M " : "%d.%m. %H:%M ", &lt);
    }
    const std::string add = (out.empty() ? "" : " · ") + std::string(ts) + e.text;
    const size_t l = chars(add);
    if (len + l > 255) break;
    out += add;
    len += l;
  }
  if (out.empty()) out = "–";
  this->publish_(this->events_sensor_, out);
}

void EqivaKeyBle::on_lock_state_(uint8_t st) {
  const uint32_t now = millis();
  if (this->last_status_sensor_ != nullptr) {   // jede Statusmeldung: Zeitpunkt merken, z. B. 2026-11-10T12:02:05+01:00
    const time_t t = ::time(nullptr);
    struct tm lt;
    char iso[32] = "";
    if (t > 1600000000 && localtime_r(&t, &lt) != nullptr) {
      char tz[8];
      strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%S", &lt);
      strftime(tz, sizeof(tz), "%z", &lt);   // +0100 -> +01:00
      if (strlen(tz) == 5) snprintf(iso + strlen(iso), sizeof(iso) - strlen(iso), "%.3s:%.2s", tz, tz + 3);
    }
    this->publish_(this->last_status_sensor_, iso);
  }
  if (st == 1 && reaction_pending_) {    // erster Motorstart nach dem Befehl = Reaktionszeit
    reaction_pending_ = false;
    uint32_t ms = now - reaction_started_;
    if (ms > 65535) ms = 65535;
    reaction_hist_.push_back({reaction_act_, (uint16_t) ms, reaction_src_});
    if (reaction_hist_.size() > 10) reaction_hist_.erase(reaction_hist_.begin());
    if (this->reaction_sensor_ != nullptr) this->reaction_sensor_->publish_state(ms / 1000.0f);
    // Format je Eintrag: Aktion|Sekunden|Quelle, Einträge mit "; " getrennt (z|4.1|Zeitplan 1; a|3.0|HA/Web).
    // Das Leerzeichen erlaubt den Zeilenumbruch in der ESPHome-Expertenansicht.
    std::string list;
    for (size_t i = 0; i < reaction_hist_.size(); i++) {
      char buf[32];
      snprintf(buf, sizeof(buf), "%s%c|%.1f|", i ? "; " : "", reaction_hist_[i].act, reaction_hist_[i].ms / 1000.0f);
      list += buf + reaction_hist_[i].src;
    }
    this->publish_(this->reaction_list_sensor_, list);
    ev_reaction_ms_ = ms ? ms : 1;       // fürs Ereignis "🔒 Quelle (2,4 s)"
    ESP_LOGI(TAG, "Reaktionszeit: %.1f s", ms / 1000.0f);
  }
  if (st == 1) {                         // MOVING
    if (ev_pending_ >= 0) ev_moved_ = true;
    return;
  }
  if (st < 2 || st > 4) return;          // UNKNOWN: nichts protokollieren
  static const char *const icon[] = {"", "", "🔓", "🔒", "🚪"};
  static const char *const word[] = {"", "", "auf", "zu", "geöffnet"};
  if (ev_pending_ >= 0) {
    const uint8_t want = ev_pending_ == LOCK ? 3 : (ev_pending_ == UNLOCK ? 2 : 4);
    if (st == want) {
      this->ev_success_(st, now, ::time(nullptr));
    } else if (ev_pending_ == OPEN && st == 2 && ev_moved_) {
      // Öffnen gefahren, Schloss meldet "auf": auf OPENED warten, sonst nach 10 s als Erfolg werten (ev_tick_)
      if (!ev_open_unlocked_) { ev_open_unlocked_ = true; ev_open_unlocked_ms_ = now; ev_open_unlocked_t_ = ::time(nullptr); }
    } else if (ev_moved_ && !(ev_pending_ == OPEN && st == 2)) {
      // nach der Fahrt ein anderer Endzustand -> Befehl nicht ausgeführt
      this->log_event(std::string("✗ ") + (want == 3 ? "zu" : want == 2 ? "auf" : "öffnen") + " " +
                      ev_pending_src_ + " (jetzt " + word[st] + ")");
      ev_pending_ = -1;
      hand_quiet_ = true;
      hand_quiet_since_ = now;
    }
    ev_last_state_ = st;
    return;
  }
  // Ohne Befehl: Zustandswechsel = von Hand (Schlüssel, Drehknauf, Taste am Schloss)
  if (hand_quiet_ && (now - hand_quiet_since_) >= HAND_QUIET_MS) hand_quiet_ = false;
  if (ev_last_state_ != 255 && st != ev_last_state_ &&
      !(ev_last_state_ == 4 && st == 2) &&          // OPENED -> UNLOCKED: Falle zurück, kein Ereignis
      !hand_quiet_) {
    this->log_event(std::string("🖐 ") + icon[st] + " von Hand");
  }
  ev_last_state_ = st;
}

// Befehl bestätigt: Ereignis "🔒 Quelle (2,4 s)" mit Zeitpunkt t
void EqivaKeyBle::ev_success_(uint8_t st, uint32_t now, time_t t) {
  static const char *const icon[] = {"", "", "🔓", "🔒", "🚪"};
  std::string dur;
  if (ev_reaction_ms_ > 0) {             // Reaktionszeit mit Dezimalkomma anhängen
    char b[16];
    snprintf(b, sizeof(b), " (%.1f s)", ev_reaction_ms_ / 1000.0f);
    for (char *c = b; *c; c++) if (*c == '.') *c = ',';
    dur = b;
  }
  this->log_event_at_(std::string(icon[st]) + " " + ev_pending_src_ + dur, t);
  if (ev_pending_ == OPEN) { hand_quiet_ = true; hand_quiet_since_ = now; }
  ev_pending_ = -1;
  ev_reaction_ms_ = 0;
  ev_open_unlocked_ = false;
}

void EqivaKeyBle::ev_fail_(const char *why) {
  if (ev_pending_ < 0) return;
  static const char *const w[] = {"zu", "auf", "öffnen"};
  this->log_event(std::string("✗ ") + w[ev_pending_ <= 2 ? ev_pending_ : 0] + " " + ev_pending_src_ +
                  " (" + why + ")");
  ev_pending_ = -1;
  ev_open_unlocked_ = false;
  hand_quiet_ = true;
  hand_quiet_since_ = millis();
}

void EqivaKeyBle::ev_tick_() {
  // Öffnen ohne OPENED-Meldung: 10 s nach "auf" als ausgeführt werten (Zeitpunkt = Meldung "auf")
  if (ev_pending_ == OPEN && ev_open_unlocked_ && (millis() - ev_open_unlocked_ms_) >= OPEN_NO_OPENED_MS)
    this->ev_success_(4, ev_open_unlocked_ms_, ev_open_unlocked_t_);
  if (ev_pending_ >= 0 && (millis() - ev_pending_at_) > 60000) this->ev_fail_("keine Bestätigung");
  // Tageswechsel: gestrige Einträge bekommen ihr Datum
  static int last_yday = -1;
  time_t now = ::time(nullptr);
  struct tm lt;
  if (now > 1600000000 && localtime_r(&now, &lt) != nullptr && lt.tm_yday != last_yday) {
    if (last_yday >= 0) this->publish_events_();
    last_yday = lt.tm_yday;
  }
}


void EqivaKeyBle::forget_pairing() {
  ESP_LOGW(TAG, "Kopplung entfernt - Benutzer im Schloss bleibt angelernt (Eqiva-App oder Werksreset)");
  clear_pending_();
  requestPair = false;
  if (simulate_) {
    this->sim_disconnect();
  } else {
    this->set_auto_connect(false);
    this->disconnect();
    this->set_address(1);              // wie "Disconnect": keine echte Adresse mehr
  }
  clientState.user_key.clear();
  clientState.card_key.clear();
  clientState.remote_session_nonce.clear();
  clientState.user_id = 255;
  ev_pending_ = -1;
  ev_last_state_ = 255;
  this->publish_(this->lock_status_sensor_, "");
  this->log_event("🔗 Kopplung entfernt");
}

// Rohzustand veröffentlichen (Lock BLE State) und daraus den Bluetooth-Status in Worten ableiten
void EqivaKeyBle::publish_ble_state_(const std::string &s) {
  ble_raw_ = s;
  this->publish_(this->lock_ble_state_sensor_, s);
  if (s == "ESTABLISHED") { ble_fail_.clear(); attempt_open_error_ = false; }
  this->update_ble_status_();
}

void EqivaKeyBle::update_ble_status_() {
  if (this->ble_status_sensor_ == nullptr) return;
  const char *st;
  if (ble_raw_ == "ESTABLISHED") st = "Verbunden";
  else if (!ble_fail_.empty()) st = ble_fail_.c_str();
  else if (ble_raw_ == "IDLE" || ble_raw_ == "DISCONNECTING" || ble_raw_ == "INIT") st = "Idle";
  else st = "Verbindungsaufbau";                      // CONNECTING, DISCOVERED, READY_TO_CONNECT, CONNECTED …
  this->publish_(this->ble_status_sensor_, st);
}

void EqivaKeyBle::cancel_pair() {
  if (pair_pending_ || requestPair) this->pair_restore_("vom Nutzer abgebrochen", true);
  else ESP_LOGI(TAG, "Kein Pairing aktiv");
}

void EqivaKeyBle::conn_fail_(bool not_found) {
  if (!not_found) attempt_open_error_ = true;
  ble_fail_ = not_found ? "Schloss nicht gefunden" : "Verbindungsfehler";
  this->update_ble_status_();
  if (conn_fails_ == 0) {
    const time_t now = ::time(nullptr);
    unreachable_since_ = now > 1600000000 ? now : 0;
  }
  if (conn_fails_ < 255) conn_fails_++;
  if (conn_fails_ >= 2 && !unreachable_logged_) {
    unreachable_logged_ = true;
    ESP_LOGW(TAG, "Schloss nicht erreichbar (%u Versuche) - Batterie und Reichweite prüfen", conn_fails_);
    this->log_event("⚠️ Schloss nicht erreichbar");
  }
}

void EqivaKeyBle::conn_ok_() {
  if (unreachable_logged_) this->log_event("✓ Schloss wieder erreichbar");
  conn_fails_ = 0;
  unreachable_since_ = 0;
  unreachable_logged_ = false;
}

void EqivaKeyBle::pair_restore_(const char *why, bool cancelled) {
  requestPair = false;
  pair_pending_ = false;
  clientState.card_key.clear();
  clientState.remote_session_nonce.clear();
  clear_pending_();
  if (prev_user_key_.length() == 16) {
    clientState.user_key = prev_user_key_;
    clientState.user_id = prev_user_id_;
    if (prev_address_ > 1) this->set_address(prev_address_);
    ESP_LOGW(TAG, "Pairing gescheitert: %s - bisherige Kopplung (User %d) bleibt", why, prev_user_id_);
    this->log_event(cancelled ? "✗ Pairing abgebrochen – bisherige Kopplung bleibt" : "✗ Pairing nicht bestätigt – bisherige Kopplung bleibt");
    this->set_auto_connect(true);
  } else {
    clientState.user_key.clear();
    clientState.user_id = 255;
    ESP_LOGW(TAG, "Pairing gescheitert: %s", why);
    this->log_event(cancelled ? "✗ Pairing abgebrochen" : "✗ Pairing nicht bestätigt");
    this->set_auto_connect(false);
  }
  prev_user_key_.clear();
  this->disconnect();
}

}  // namespace eqiva_key_ble
}  // namespace esphome

#endif
