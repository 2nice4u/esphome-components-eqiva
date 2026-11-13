import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import sensor
from esphome.const import (
    DEVICE_CLASS_DURATION,
    DEVICE_CLASS_SIGNAL_STRENGTH,
    ENTITY_CATEGORY_DIAGNOSTIC,
    STATE_CLASS_MEASUREMENT,
    STATE_CLASS_TOTAL_INCREASING,
    UNIT_DECIBEL_MILLIWATT,
    UNIT_SECOND,
)
from . import CONF_EQIVA_KEY_BLE_ID, EqivaKeyBle

DEPENDENCIES = ["eqiva_key_ble"]

CONF_RSSI = "rssi"
CONF_REACTION_TIME = "reaction_time"
CONF_MOTOR_RUNS = "motor_runs"
CONF_CONNECTS = "connects"

# Patch: Empfangsstärke der aktiven BLE-Verbindung zum Schloss (keine MAC nötig)
CONFIG_SCHEMA = cv.Schema(
    {
        cv.GenerateID(CONF_EQIVA_KEY_BLE_ID): cv.use_id(EqivaKeyBle),
        cv.Optional(CONF_RSSI): sensor.sensor_schema(
            unit_of_measurement=UNIT_DECIBEL_MILLIWATT,
            accuracy_decimals=0,
            device_class=DEVICE_CLASS_SIGNAL_STRENGTH,
            state_class=STATE_CLASS_MEASUREMENT,
            entity_category=ENTITY_CATEGORY_DIAGNOSTIC,
        ),
        # Reaktionszeit: Befehl abgesetzt -> Motor dreht (Sekunden)
        cv.Optional(CONF_REACTION_TIME): sensor.sensor_schema(
            unit_of_measurement=UNIT_SECOND,
            accuracy_decimals=1,
            device_class=DEVICE_CLASS_DURATION,
            state_class=STATE_CLASS_MEASUREMENT,
        ),
        # Zähler seit dem letzten Batteriewechsel (gespeichert, Reset über battery_changed())
        cv.Optional(CONF_MOTOR_RUNS): sensor.sensor_schema(
            icon="mdi:cog-counterclockwise",
            accuracy_decimals=0,
            state_class=STATE_CLASS_TOTAL_INCREASING,
        ),
        cv.Optional(CONF_CONNECTS): sensor.sensor_schema(
            icon="mdi:bluetooth-connect",
            accuracy_decimals=0,
            state_class=STATE_CLASS_TOTAL_INCREASING,
        ),
    }
)


async def to_code(config):
    hub = await cg.get_variable(config[CONF_EQIVA_KEY_BLE_ID])
    if conf := config.get(CONF_RSSI):
        sens = await sensor.new_sensor(conf)
        cg.add(hub.set_rssi_sensor(sens))
    if conf := config.get(CONF_REACTION_TIME):
        sens = await sensor.new_sensor(conf)
        cg.add(hub.set_reaction_time_sensor(sens))
    if conf := config.get(CONF_MOTOR_RUNS):
        sens = await sensor.new_sensor(conf)
        cg.add(hub.set_motor_runs_sensor(sens))
    if conf := config.get(CONF_CONNECTS):
        sens = await sensor.new_sensor(conf)
        cg.add(hub.set_connects_sensor(sens))
