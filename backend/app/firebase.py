import os
import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def get_db():
    global _db
    if _db is None:
        key_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        if not key_path:
            raise RuntimeError("GOOGLE_APPLICATION_CREDENTIALS env var is not set")
        cred = credentials.Certificate(key_path)
        firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db
