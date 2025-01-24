import os
import sys

# Add the project root to sys.path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.core.database import  engine
from app.models.models import Base


def init_db():
    # Create tables
    Base.metadata.create_all(bind=engine)


if __name__ == "__main__":
    init_db()
