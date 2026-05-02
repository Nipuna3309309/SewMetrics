import os
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

_client = None


def get_db():
    global _client
    if _client is None:
        _client = MongoClient(os.getenv("MONGODB_URI"))
    return _client["sewmetrics"]


def fetch_sensor(machine_id: str, sensor: str, limit: int = 200):
    db = get_db()
    docs = list(
        db["sensor_readings"]
        .find(
            {"machine_id": machine_id, "sensor": sensor},
            {"_id": 0},
        )
        .sort("received_at", -1)
        .limit(limit)
    )
    docs.reverse()
    return docs


def fetch_all_sensors(machine_id: str, limit_per_sensor: int = 100):
    return {
        "rpm": fetch_sensor(machine_id, "rpm", limit_per_sensor),
        "stitches": fetch_sensor(machine_id, "stitches", limit_per_sensor),
        "vibration": fetch_sensor(machine_id, "vibration", limit_per_sensor),
        "temperature": fetch_sensor(machine_id, "temperature", limit_per_sensor),
    }
