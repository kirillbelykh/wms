from sqlalchemy.orm import sessionmaker
from app.database.db import SessionLocal

def get_db():
    """
    Dependency to get a database session.
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()