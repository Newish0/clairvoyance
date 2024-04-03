


General API backend.

For routes, trips, maps info etc... 


Structure:
- `index.ts` is root page 
- all routes should be a sub route and goes inside of `routes`
  - each sub route will have its own directory 
    - `routes/foobar/index.ts` contains the hono router
    - `routes/foobar/controller.ts` or `routes/foobar/controllers/...` should contains the controllers/route handlers 
    - `routes/foobar/services.ts` or `routes/foobar/services/...` should contains the services used int his route
- `./utils` contains utility functions shared by everything in this project 
- `./services` contains services that are global across this project (i.e. GTFS init). 