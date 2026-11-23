import { priceMiles, dollars } from "../../../functions/lib/fareEstimate.mjs";
import { BRAND, FARE_CONFIG } from "../../config/constants";

/** "Trip about 4.5 mi · about $10.74 on the meter" from the miles the rider priced. Nothing if unknown. */
export default function TripSize({ miles, passengers = 1, className = "" }) {
  const est = priceMiles({ miles: Number(miles), fare: FARE_CONFIG, passengers: passengers || 1, cfg: BRAND.pricing?.estimate || {} });
  if (!est) return null;
  return (
    <p className={className} data-testid="trip-size">
      Trip about {est.miles} mi &middot; about {dollars(est.fareCents)} on the meter
    </p>
  );
}
