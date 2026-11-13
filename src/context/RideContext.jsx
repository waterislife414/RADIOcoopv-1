import { createContext, useContext, useState } from "react";

const RideContext = createContext(null);

const initialRide = {
  guestFirstName: "",
  guestLastName: "",
  pickup: "",
  dropoff: "",
  passengers: 1,
  stops: [],
  roundTrip: false,
  needsAccessibleVehicle: false,
  wantsPriorityPass: false,
  estMiles: 0,
  outOfArea: false,
  outOfAreaCity: "",
  scheduleType: "now",
  scheduledFor: null,
  recurring: false,
  paymentMethod: null,
  phone: "",
  promoCode: "",
  estimatedFare: null,
  lastRideId: null,
};

export function RideProvider({ children }) {
  const [ride, setRide] = useState(initialRide);

  function updateRide(fields) {
    setRide((prev) => ({ ...prev, ...fields }));
  }
  function addStop(stop) {
    setRide((prev) => ({ ...prev, stops: [...prev.stops, stop] }));
  }
  function removeStop(index) {
    setRide((prev) => ({
      ...prev,
      stops: prev.stops.filter((_, i) => i !== index),
    }));
  }
  function resetRide() {
    setRide(initialRide);
  }

  const value = { ride, updateRide, addStop, removeStop, resetRide };
  return <RideContext.Provider value={value}>{children}</RideContext.Provider>;
}

export function useRide() {
  return useContext(RideContext);
}
