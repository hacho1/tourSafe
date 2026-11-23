export interface WalkingRoute {
  seconds: number;
  meters: number;
  coordinates: [longitude: number, latitude: number][];
}

export interface WalkingRoutes {
  fast: WalkingRoute;
  comfort: WalkingRoute | null;
  alternative: 'different' | 'same' | 'unavailable';
}
