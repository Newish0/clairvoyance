<div align="center">

<h1>Clairvoyance</h1>

![TanStack Router](https://img.shields.io/badge/TanStack%20Router-00B970?style=for-the-badge&logo=tanstack&logoColor=white)
![Bun](https://img.shields.io/badge/bun-%23f472b6.svg?style=for-the-badge&logo=bun&logoColor=white)
![tRPC](https://img.shields.io/badge/tRPC-%232596BE.svg?style=for-the-badge&logo=trpc&logoColor=white)
![React](https://img.shields.io/badge/react-%2320232a.svg?style=for-the-badge&logo=react&logoColor=%2361DAFB)
![TypeScript](https://img.shields.io/badge/typescript-%233178C6.svg?style=for-the-badge&logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/docker-%232496ED.svg?style=for-the-badge&logo=docker&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/postgresql-%234169E1.svg?style=for-the-badge&logo=postgresql&logoColor=white)
![Drizzle](https://img.shields.io/badge/drizzle-%23C5F74F.svg?style=for-the-badge&logo=drizzle&logoColor=black)
![MapLibre GL](https://img.shields.io/badge/MapLibre%20GL-%233966FF.svg?style=for-the-badge&logo=maplibre&logoColor=white)

Realtime transit webapp using GTFS data in a microservice architecture.


Visit the [demo site](https://transit.hy1.dev).

</div>

## Features

- **Interactive map** - Browse routes, stops, and vehicle positions across the network
- **Nearby stops** - Find transit stops around your current location
- **Departure predictions** - Know when your next ride arrives with live estimates
- **Full schedules** - Timetables for trip planning across the entire network
- **Live vehicle tracking** - See buses and trains move on the map in real time
- **Trip details** - Timeline, route map, and stop information for any trip
- **Service alerts** - Stay informed about delays, detours, and disruptions


## Architecture

```mermaid
graph TB
    subgraph External
        GTFS[GTFS Static + Realtime Feeds]
    end
    subgraph Monorepo
        ingest[transit-ingest<br/>ETL Pipeline]
        db[(PostgreSQL + PostGIS<br/>Database)]
        api[transit-api<br/>tRPC + SSE]
        nginx[nginx<br/>Gateway]
        app[transit-app<br/>React SPA]
    end
    subgraph Client
        User[Browser]
    end

    GTFS --> ingest
    ingest --> db
    db --> api
    api --> nginx
    app --> nginx
    nginx --> api
    User --> nginx
```

## Tech Stack

- **Frontend**: TanStack Router + React 19 + TanStack Query + Tailwind CSS + shadcn/ui + Vite + TypeScript
- **Backend**: Bun + tRPC (SSE subscriptions for realtime)
- **ETL**: Bun CLI + Protobuf + TypeScript + AsyncIterable streaming pipeline
- **ORM**: Drizzle ORM
- **Database**: PostgreSQL 18 + PostGIS 3
- **Maps**: MapLibre GL + Protomaps tiles
- **Containerization**: Docker
- **Reverse Proxy**: nginx
- **Monorepo**: Bun workspaces

## Roadmap

- **PWA**: Manifest + icons done, service worker pending
- **Offline Support**: Not started
- **Additional agency support**: Extend ingestion for more transit agencies
- **Performance**: Continued query optimization and UI responsiveness

## Quick Start

```bash
docker compose up -d --build
```

