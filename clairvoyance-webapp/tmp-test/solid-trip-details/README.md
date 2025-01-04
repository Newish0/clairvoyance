# solid-trip-details/solid-trip-details/README.md

# Solid Trip Details

This project is a Solid.js application that displays current trip details, including route information, stop details, and other trips arriving at the current stop. It utilizes SHADCN Solid.js components and Lucide Solid icons for a modern UI.

## Project Structure

```
solid-trip-details
├── src
│   ├── components
│   │   ├── TripDetails.tsx      # Main component for displaying trip details
│   │   ├── TripInfo.tsx         # Component for displaying route's short and long names
│   │   ├── StopInfo.tsx         # Component for displaying stop information and arrival time
│   │   └── OtherTrips.tsx       # Component for listing other trips and their arrival times
│   ├── services
│   │   ├── route.ts              # Service for fetching route details
│   │   ├── stops.ts              # Service for fetching stops for a specific trip
│   │   └── stop_times.ts         # Service for fetching stop times for a route and stop
│   └── types
│       └── index.ts              # TypeScript types and interfaces
├── package.json                   # npm configuration file
├── tsconfig.json                  # TypeScript configuration file
└── README.md                      # Project documentation
```

## Setup Instructions

1. Clone the repository:
   ```
   git clone <repository-url>
   cd solid-trip-details
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Start the development server:
   ```
   npm run dev
   ```

## Usage

- The main component `TripDetails` fetches and displays the current trip details.
- Subcomponents `TripInfo`, `StopInfo`, and `OtherTrips` are used to organize the information displayed.
- The application fetches data from a GTFS API to provide real-time trip information.

## Contributing

Feel free to submit issues or pull requests for any improvements or bug fixes. 

## License

This project is licensed under the MIT License.