


<div align="center">

# 🚧 **Project Under Construction** 🚧
 
#### 🛠️ **This project is still in progress.** 

</div>


<div align="center">

<!-- <img src="clairvoyance-webapp/public/favicon.svg"> -->

<h1>Clairvoyance</h1>


![Astro](https://img.shields.io/badge/astro-%23FF5A1F.svg?style=for-the-badge&logo=astro&logoColor=white)
![FastAPI](https://img.shields.io/badge/fastapi-%2300C7B7.svg?style=for-the-badge&amp;logo=fastapi&amp;logoColor=white)
![SolidJS](https://img.shields.io/badge/solid.js-%2320232a.svg?style=for-the-badge&logo=solid&logoColor=%2361DAFB)
![Docker](https://img.shields.io/badge/docker-%232496ED.svg?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-%23336791.svg?style=for-the-badge&logo=postgresql&logoColor=white)

A Realtime transit webapp using GTFS data.

Visit the [demo site](https://bp.botnewish.xyz/clairvoyance2/).

</div>

## 🚀 Features

-   📊 Real-time transit updates
-   🗺️ Interactive maps with transit routes
-   📅 Schedule and arrival times
-   🌐 API for accessing transit data

## 🛠️ Tech Stack

-   **Frontend**: Astro + SolidJS + TypeScript
-   **UI Components**: SolidUI (Shadcn) with Tailwind CSS
-   **Backend**: FastAPI (Python)
-   **ORM**: SQLAlchemy
-   **Database**: PostgreSQL
-   **Containerization**: Docker
-   **Build Tool**: Astro/Vite



## 💻 Development Setup

If you want to contribute or build from source:

1. Prerequisites:

    - Node.js (v18 or higher)
    - Python 3.8+
    - PostgreSQL
    - Pnpm
    - Docker 
    - Docker compose
    - Git

2. Clone and setup:
    ```bash
    git clone https://github.com/yourusername/clairvoyance.git
    cd clairvoyance
    pnpm install
    ```

3. Setup the backend:
    ```bash
    cd api
    python -m venv venv
    source venv/bin/activate  # On Windows: venv\Scripts\activate
    pip install -r requirements.txt
    ```

4. Initialize the database:
    ```bash
    createdb gtfs_db
    python scripts/init_db.py
    python scripts/init_gtfs.py
    ```

5. In `clairvoyance-webapp`, start the frontend development server:
    ```bash
    pnpm run dev
    ```
6. In `api`, start the API development server:
    ```bash
    uvicorn main:app --host 0.0.0.0 --port 8000 --reload
    ```
7. In `api`, start the realtime GTFS data consumer script 
    ```bash
    python scripts/start_realtime_updates.py
    ```

## 📝 License

This project is licensed under the MIT license - see the LICENSE file for details.