import esphome.codegen as cg
import esphome.config_validation as cv
from esphome.components import sensor
from esphome.const import (
    DEVICE_CLASS_SIGNAL_STRENGTH,
    ENTITY_CATEGORY_DIAGNOSTIC,
    STATE_CLASS_MEASUREMENT,
    UNIT_DECIBEL_MILLIWATT,
)
from . import CONF_EQIVA_KEY_BLE_ID, EqivaKeyBle

DEPENDENCIES = ["eqiva_key_ble"]

CONF_RSSI = "rssi"

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
    }
)


async def to_code(config):
    hub = await cg.get_variable(config[CONF_EQIVA_KEY_BLE_ID])
    if conf := config.get(CONF_RSSI):
        sens = await sensor.new_sensor(conf)
        cg.add(hub.set_rssi_sensor(sens))
