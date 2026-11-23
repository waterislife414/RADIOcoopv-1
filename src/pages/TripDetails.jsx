import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { collection, getDocs, limit, orderBy, query, where, onSnapshot } from "firebase/firestore";
import { zoneForPoint } from "../../functions/lib/dispatchCore.mjs";
import { db } from "../config/firebase";
import { useAuth } from "../context/AuthContext";
import { memberDealsFor, DEALS } from "../lib/memberDeals";
import { loadStripe } from "@stripe/stripe-js";
import { submitRide, lastPayMethod, rememberedGuest } from "../lib/submitRide";
import PinPicker from "../components/PinPicker";
import AddressSearch from "../components/AddressSearch";
import { readLocationOnce } from "../utils/rideLive";
import { BRAND, COMPANY_EMAIL, COMPANY_PHONE_DISPLAY, STRIPE_PUBLISHABLE_KEY } from "../config/constants";
import { reverseGeocode } from "../lib/reverseGeocode";

import { consentIsCurrent, consentRecord } from "../legal/documents";
const RIDER_DOCS = ["rider-terms", "privacy"];
const stripePromise = loadStripe(STRIPE_PUBLISHABLE_KEY);
const mySavedCard = httpsCallable(functions, "mySavedCard");
const createPaymentIntent = httpsCallable(functions, "createPaymentIntent");
const RR = { headsUpMinutes: 4, lateCancelFee: 5, waitGraceMinutes: 2, noShowFee: 10, ...(BRAND.rideRules || {}) };
const WAIT = Number(BRAND.pricing?.fare?.WAIT_TIME_PER_MINUTE) || 0.35;
const brandName = (b) => ({ visa: "Visa", mastercard: "Mastercard", amex: "Amex", discover: "Discover" })[b] || "card";
import { useRide } from "../context/RideContext";
import BrandHeader from "../components/BrandHeader";
import { recentPlacesFull, rememberPlaces } from "../utils/recentPlaces";
import { useTripEstimate } from "../lib/tripEstimate";
import { httpsCallable } from "firebase/functions";
import { functions } from "../config/firebase";
import { dollars } from "../../functions/lib/fareEstimate.mjs";
import {
  SURROUNDING_SERVICE_CITIES,
  OUT_OF_AREA