#pragma once

#include "esphome/components/esp32_ble_client/ble_client_base.h"
#include "esphome/components/esp32_ble_tracker/esp32_ble_tracker.h"
#include "esphome/components/text_sensor/text_sensor.h"
#include "esphome/components/sensor/sensor.h"
#include "esphome/core/component.h"
#include "esphome/core/automation.h"
#include "esphome/core/hal.h"

#include <queue>
#include <vector>
#include <deque>
#include <string>
#include <ctime>
#include "eQ3_constants.h"
#include "eQ3_message.h"
#include "eQ3_util.h"
#include <esp_log.h>

#ifdef USE_ESP32


namespace esphome {
namespace eqiva_key_ble {


using namespace esp32_ble_client;

// Version der gepatchten Komponente (gehört zu den Beispiel-YAMLs mit gleicher Version)
#define EQIVA_PATCH_VERSION "3.5.1"

// Patch-Konstanten
static const uint32_t SEND_TIMEOUT_MS = 3000;      // Timeout für Fragment-Write / Nonce-Antwort
static const uint8_t MAX_NONCE_RETRIES = 3;        // danach Verbindung neu aufbauen
static const uint8_t MSG_ID_STATUS_REQUEST = 0x82;
static const uint32_t KEEPALIVE_MS = 240000;       // Schloss trennt nach ~5 min Inaktivität

// Patch: Energiemodi
enum PowerMode : uint8_t {
    POWER_FAST = 0,       // Dauerverbindung, kurzer Verbindungsabstand
    POWER_BALANCED = 1,   // Dauerverbindung, längerer Verbindungsabstand
    POWER_ECO = 2,        // nur bei Bedarf verbinden, trennen nach Leerlauf
};

class EqivaKeyBle;

// Patch: Auslöser, wenn das Schloss ein Pairing bestätigt hat (Variable: user_id)
class PairedTrigger : public Trigger<int> {
 public:
  explicit PairedTrigger(EqivaKeyBle *parent);
};

class EqivaKeyBle : public BLEClientBase {
    bool sendMessage(eQ3Message::Message *msg, bool nonce);
    void sendFragment();
    void sendNonce();
    void init();
    void finishPair();

    // --- Patch: Hilfsfunktionen ---
    void watchdog_();
    void reset_session_();
    void retain_(eQ3Message::Message *msg);
    void clear_pending_();
    void publish_(text_sensor::TextSensor *sensor, const std::string &value) {
        if (sensor != nullptr && sensor->get_state() != value)
            sensor->publish_state(value);
    }

    std::queue<eQ3Message::MessageFragment> sendQueue;
    // Patch: alle Member initialisiert (vorher undefinierte Startwerte)
    BLECharacteristic *write{nullptr};
    BLECharacteristic *read{nullptr};
    bool sendingNonce{false};
    uint32_t sending{0};                 // millis() des Fragments in Arbeit, 0 = frei
    eQ3Message::Message *currentMsg{nullptr};
    uint32_t current_msg_time_{0};       // wann die zurückgehaltene Nachricht entstand
    bool requestPair{false};
    uint32_t nonce_sent_time_{0};
    uint8_t nonce_retries_{0};
    uint32_t command_timeout_{20000};
    uint32_t pair_started_{0};
    uint32_t last_rssi_read_{0};
    // Energiemodi
    uint8_t power_mode_{POWER_FAST};
    uint32_t balanced_interval_ms_{100};
    uint32_t idle_timeout_{30000};
    uint32_t eco_poll_interval_{1800000};
    uint32_t last_activity_{0};
    uint32_t last_eco_poll_{0};
    bool eco_poll_done_{false};
    bool conn_params_applied_{false};
    uint32_t connect_requested_at_{0};   // für Zeitmessung im Sparmodus
    std::vector<PairedTrigger *> paired_triggers_;
    // --- Simulation (ohne Schloss, zum Testen von Fingerprint/Zeitplan/LED) ---
    bool simulate_{false};
    bool sim_reachable_{true};
    bool sim_connected_{false};
    bool sim_connecting_{false};
    uint32_t sim_conn_ready_{0};
    uint8_t sim_state_{3};               // 2 = UNLOCKED, 3 = LOCKED, 4 = OPENED
    uint8_t sim_target_{0};              // Zielzustand während MOVING (0 = keine Fahrt)
    uint32_t sim_move_end_{0};
    uint32_t sim_travel_ms_{3000};
    int sim_pending_{-1};                // wartender Befehl bis die simulierte Verbindung steht
    uint32_t sim_pending_since_{0};
    void sim_tick_();
    void sim_execute_(int cmd);
    void sim_publish_state_(uint8_t st);
    void sim_set_connected_(bool c);
    void apply_conn_params_();
    void touch_() { last_activity_ = millis(); }
    // --- Ereignisprotokoll (letzte 10 Ereignisse, neuestes zuerst) ---
    struct Event { time_t t; std::string text; };
    std::deque<Event> events_;
    std::string cmd_source_;             // Auslöser des nächsten Befehls (gilt 3 s)
    uint32_t cmd_source_at_{0};
    int ev_pending_{-1};                 // erwarteter Befehl (LOCK/UNLOCK/OPEN), -1 = keiner
    std::string ev_pending_src_;
    uint32_t ev_pending_at_{0};
    bool ev_moved_{false};               // seit dem Befehl MOVING gesehen
    uint32_t last_command_ms_{0};
    bool last_command_valid_{false};
    uint8_t ev_last_state_{255};         // letzter Endzustand (2/3/4), 255 = unbekannt
    void on_lock_state_(uint8_t st);
    void ev_tick_();
    // Pairing-Absicherung: bisherige Kopplung bis zur Bestätigung durch das Schloss merken
    bool pair_pending_{false};
    std::string prev_user_key_;
    int prev_user_id_{255};
    uint64_t prev_address_{0};
    void pair_restore_(const char *why, bool cancelled = false);
    // Erreichbarkeit: aufeinanderfolgende fehlgeschlagene Verbindungsversuche
    uint8_t conn_fails_{0};
    time_t unreachable_since_{0};
    bool unreachable_logged_{false};
    void conn_fail_();
    void conn_ok_();
    void ev_fail_(const char *why);
    void publish_events_();
    void request_connect_();

    std::string getClientState() {
        std::string client_state;
        switch(this->state()) {
            case espbt::ClientState::INIT: {
                client_state = "INIT";
                break;
            }
            case espbt::ClientState::DISCONNECTING: {
                client_state = "DISCONNECTING";
                break;
            }
            case espbt::ClientState::IDLE: {
                client_state = "IDLE";
                break;
            }
            case espbt::ClientState::DISCOVERED: {
                client_state = "DISCOVERED";
                break;
            }
            case espbt::ClientState::CONNECTING: {
                client_state = "CONNECTING";
                break;
            }
            case espbt::ClientState::CONNECTED: {
                client_state = "CONNECTED";
                break;
            }
            case espbt::ClientState::ESTABLISHED: {
                client_state = "ESTABLISHED";
                break;
            }
            default: {
                client_state = "OTHER";
                break;
            }
        }
        return client_state;
    }
    public:
        ClientState clientState;
        void setup() override;
        void connect() override;   // Patch: schnelle Parameter für Verbindungsaufbau + Service Discovery
        void startPair();
        void applySettings();
        void sendCommand(CommandType command);
        void set_command_timeout(uint32_t ms) { this->command_timeout_ = ms; }
        void add_on_paired_trigger(PairedTrigger *t) { this->paired_triggers_.push_back(t); }
        // Patch: Energiemodus (0 = schnell, 1 = ausgewogen, 2 = sparsam), live umschaltbar
        void set_power_mode(int mode);
        void set_balanced_interval_ms(uint32_t ms);
        void set_idle_timeout(uint32_t ms) { this->idle_timeout_ = ms < 5000 ? 5000 : ms; }
        void set_eco_poll_interval(uint32_t ms) { this->eco_poll_interval_ = ms < 60000 ? 60000 : ms; }
        uint8_t get_power_mode() const { return this->power_mode_; }
        void set_user_id(int user_id) {
            clientState.user_id = user_id;
        }
        void set_user_key(std::string user_key) {
            if (user_key.length() > 0) {
                clientState.user_key = hexstring_to_string(user_key);
            }
        }
        void set_card_key(std::string card_key) {
            // Patch: Länge prüfen, sonst wirft substr() -> Absturz bei Tippfehler
            if (card_key.length() < 46) {
                ESP_LOGE("eqiva_key_ble", "Card Key zu kurz (%u Zeichen) - bitte kompletten QR-Code-Inhalt eingeben", (unsigned) card_key.length());
                clientState.card_key.clear();
                return;
            }
            for(char &c : card_key)
                c = tolower(c);
            clientState.card_key = card_key.substr(14, 32);
        }
        void set_turn_left(bool turn_left) { clientState.turn_left = turn_left; }
        void set_key_horizontal(bool key_horizontal) { clientState.key_horizontal = key_horizontal; }
        void set_lock_turns(int lock_turns) { clientState.lock_turns = lock_turns; }


        void set_lock_ble_state_sensor(text_sensor::TextSensor *lock_ble_state_sensor) { this->lock_ble_state_sensor_ = lock_ble_state_sensor; }
        void set_low_battery_sensor(text_sensor::TextSensor *low_battery_sensor) { this->low_battery_sensor_ = low_battery_sensor; }
        void set_lock_status_sensor(text_sensor::TextSensor *lock_status_sensor) { this->lock_status_sensor_ = lock_status_sensor; }
        void set_user_key_sensor(text_sensor::TextSensor *user_key_sensor) { this->user_key_sensor_ = user_key_sensor; }
        void set_user_id_sensor(text_sensor::TextSensor *user_id_sensor) { this->user_id_sensor_ = user_id_sensor; }
        void set_mac_address_sensor(text_sensor::TextSensor *mac_address_sensor) { this->mac_address_sensor_ = mac_address_sensor; }
        void set_rssi_sensor(sensor::Sensor *rssi_sensor) { this->rssi_sensor_ = rssi_sensor; }
        void set_events_sensor(text_sensor::TextSensor *events_sensor) { this->events_sensor_ = events_sensor; }
        // Reaktionszeit: vom Befehl bis das Schloss sich dreht (Sekunden, letzte 10 als Liste)
        void set_reaction_time_sensor(sensor::Sensor *s) { this->reaction_sensor_ = s; }
        void set_reaction_list_sensor(text_sensor::TextSensor *s) { this->reaction_list_sensor_ = s; }
        // Ereignisprotokoll: Eintrag mit Uhrzeit (sofern bekannt) hinzufügen
        void log_event(const std::string &text);
        // Auslöser für den nächsten Befehl setzen (z. B. "Max", "Zeitplan 1"); gilt 3 s, sonst "HA/Web"
        void set_cmd_source(const std::string &src) { this->cmd_source_ = src; this->cmd_source_at_ = millis(); }
        // Simulation: kein BLE, Schloss wird nachgebildet (Zustände, Fahrzeit, Sparmodus-Verbindung)
        void set_simulate(bool s) { this->simulate_ = s; }
        bool is_simulated() const { return this->simulate_; }
        void set_sim_reachable(bool r) { this->sim_reachable_ = r; }
        void set_sim_travel_ms(uint32_t ms) { this->sim_travel_ms_ = ms < 500 ? 500 : ms; }
        void sim_connect();
        void sim_disconnect();
        void sim_turn_by_hand();         // Simulation: Schlüssel/Drehknauf von Hand drehen
        // Kopplung vergessen (z. B. Schloss getauscht): trennen, Schlüssel löschen, nicht mehr verbinden.
        // Der Benutzer bleibt im Schloss angelernt (austragen per Eqiva-App oder Werksreset).
        void forget_pairing();
        void set_pair_prev_address(uint64_t a) { this->prev_address_ = a; }
        // Laufendes Pairing abbrechen, bisherige Kopplung bleibt
        void cancel_pair();
        // Seit wann das Schloss nicht erreichbar ist (ab 2 Fehlversuchen in Folge), sonst 0; 1 = Uhrzeit unbekannt
        time_t unreachable_since() const { return conn_fails_ >= 2 ? (unreachable_since_ ? unreachable_since_ : 1) : 0; }

        void set_state(esphome::esp32_ble_tracker::ClientState st) override {
            BLEClientBase::set_state(st);
            this->publish_(this->lock_ble_state_sensor_, getClientState());
        };
        void dump_config() override;
        bool gattc_event_handler(esp_gattc_cb_event_t event, esp_gatt_if_t gattc_if,
                                esp_ble_gattc_cb_param_t *param) override;
        void gap_event_handler(esp_gap_ble_cb_event_t event, esp_ble_gap_cb_param_t *param) override;

    protected:
        text_sensor::TextSensor *lock_ble_state_sensor_{nullptr};
        text_sensor::TextSensor *low_battery_sensor_{nullptr};
        text_sensor::TextSensor *lock_status_sensor_{nullptr};
        text_sensor::TextSensor *user_key_sensor_{nullptr};
        text_sensor::TextSensor *user_id_sensor_{nullptr};
        text_sensor::TextSensor *mac_address_sensor_{nullptr};
        sensor::Sensor *rssi_sensor_{nullptr};   // Patch: Empfang der aktiven Verbindung
        text_sensor::TextSensor *events_sensor_{nullptr};
        sensor::Sensor *reaction_sensor_{nullptr};
        text_sensor::TextSensor *reaction_list_sensor_{nullptr};
        uint32_t reaction_started_{0};
        bool reaction_pending_{false};
        struct ReactionEntry { char act; uint16_t ms; std::string src; };
        std::vector<ReactionEntry> reaction_hist_;   // älteste zuerst, max. 10
        char reaction_act_{'z'};             // Aktion des laufenden Befehls: z zu, a auf, o öffnen
        std::string reaction_src_;           // Quelle des laufenden Befehls

};


inline PairedTrigger::PairedTrigger(EqivaKeyBle *parent) { parent->add_on_paired_trigger(this); }

template<typename... Ts>
class EqivaSettings : public Action<Ts...>, public Parented<EqivaKeyBle> {
    TEMPLATABLE_VALUE(bool, turn_left)
    TEMPLATABLE_VALUE(bool, key_horizontal)
    TEMPLATABLE_VALUE(int, lock_turns)
    public:
        void play(const Ts &...x) override {
            if (this->parent_->is_simulated()) { ESP_LOGI("eqiva_key_ble", "Simulation: Schloss-Einstellungen übernommen"); return; }
            auto turn_left = this->turn_left_.value(x...);
            auto key_horizontal = this->key_horizontal_.value(x...);
            auto lock_turns = this->lock_turns_.value(x...);
            this->parent_->set_turn_left(turn_left);
            this->parent_->set_key_horizontal(key_horizontal);
            this->parent_->set_lock_turns(lock_turns);
            this->parent_->applySettings();
        }
};

template<typename... Ts>
class EqivaConnect : public Action<Ts...>, public Parented<EqivaKeyBle> {
    TEMPLATABLE_VALUE(std::string, mac_address)
    TEMPLATABLE_VALUE(int, user_id)
    TEMPLATABLE_VALUE(std::string, user_key)
    public:
        void play(const Ts &...x) override {
            if (this->parent_->is_simulated()) { this->parent_->sim_connect(); return; }
            auto mac_address = this->mac_address_.value(x...);
            auto current_mac_address = this->parent_->get_address();
            if (current_mac_address != 0 && (string_to_mac(mac_address) < current_mac_address || string_to_mac(mac_address) > current_mac_address)) {
                this->parent_->disconnect();
            }
            auto user_id = this->user_id_.value(x...);
            auto user_key = this->user_key_.value(x...);
            this->parent_->set_user_id(user_id);
            this->parent_->set_user_key(user_key);
            this->parent_->set_address(string_to_mac(mac_address));
            this->parent_->set_auto_connect(true);   // Patch: ggf. nach "nicht angelernt" wieder aktivieren
            this->parent_->connect();
            ESP_LOGD("ESP Eqiva", " Address: %s, %s", this->parent_->address_str(), mac_address.c_str());

        }
};

template<typename... Ts>
class EqivaDisconnect : public Action<Ts...>, public Parented<EqivaKeyBle> {
    public:
        void play(const Ts &...x) override {
            if (this->parent_->is_simulated()) { this->parent_->sim_disconnect(); return; }
            this->parent_->disconnect();
            this->parent_->set_address(1);
        }
};

template<typename... Ts>
class EqivaPair : public Action<Ts...>, public Parented<EqivaKeyBle> {
    TEMPLATABLE_VALUE(std::string, card_key)
    TEMPLATABLE_VALUE(std::string, mac_address)
    public:
        void play(const Ts &...x) override {
            if (this->parent_->is_simulated()) { ESP_LOGW("eqiva_key_ble", "Simulation: Pairing nicht möglich/nötig"); return; }
            auto card_key = this->card_key_.value(x...);
            auto mac_address = this->mac_address_.value(x...);
            // Patch: Bei Wechsel auf ein anderes Schloss erst die alte Verbindung trennen,
            // sonst ginge der Pairing-Versuch zuerst an das alte Schloss.
            const uint64_t new_mac = string_to_mac(mac_address);
            const uint64_t cur_mac = this->parent_->get_address();
            this->parent_->set_pair_prev_address(cur_mac);   // für Wiederherstellung, falls das Pairing scheitert
            if (cur_mac > 1 && new_mac != cur_mac) {
                ESP_LOGI("eqiva_key_ble", "Pairing mit anderem Schloss - trenne alte Verbindung");
                this->parent_->disconnect();
            }
            // Patch: Adresse vor dem Pairing setzen (vorher erst danach)
            this->parent_->set_address(new_mac);
            this->parent_->set_auto_connect(true);   // Patch: ggf. nach "nicht angelernt" wieder aktivieren
            this->parent_->set_card_key(card_key);
            this->parent_->startPair();
        }
};

template<typename... Ts>
class EqivaLock : public Action<Ts...>, public Parented<EqivaKeyBle> {
 public:
  void play(const Ts &...x) override { this->parent_->sendCommand(LOCK); }
};

template<typename... Ts>
class EqivaUnlock : public Action<Ts...>, public Parented<EqivaKeyBle> {
 public:
  void play(const Ts &...x) override { this->parent_->sendCommand(UNLOCK); }
};

template<typename... Ts>
class EqivaOpen : public Action<Ts...>, public Parented<EqivaKeyBle> {
 public:
  void play(const Ts &...x) override { this->parent_->sendCommand(OPEN); }
};

template<typename... Ts>
class EqivaStatus : public Action<Ts...>, public Parented<EqivaKeyBle> {
 public:
  void play(const Ts &...x) override { this->parent_->sendCommand(REQUEST_STATUS); }
};



}  // namespace eqiva_key_ble
}  // namespace esphome

#endif
