import { Link } from "react-router-dom";
import BrandHeader from "../components/BrandHeader";
import ContactFooter from "../components/ContactFooter";
import { RIDE_RULES } from "../utils/rideLive";
import {
  BRAND,
  COMPANY_PHONE_DISPLAY,
  COMPANY_PHONE_TEL,
  FARE_CONFIG,
  OUT_OF_AREA_MINIMUM_FARE,
  LOCAL_SERVICE_CITIES,
  SURROUNDING_SERVICE_CITIES,
  SERVICE_HOURS,
} from "../config/constants";

// Fees, minutes and the Day Pass come from the same settings the app charges by.
const usd = (n) => `$${Number(n).toFixed(2).replace(/\.00$/, "")}`;
const PASS = BRAND.copy.dayPass;
const R = RIDE_RULES;

const money = (n) => `$${Number(n).toFixed(2)}`;

// Plain answers to what riders ask most. Every answer matches what the app
// actually does; update it here if prices or rules change.
const QA = [
  {
    q: "How do I get a ride?",
    a: (
      <>
        <p>
          Tap <strong>Continue as Guest</strong> (or Log In), type where to pick you up and where you&rsquo;re going, then
          choose cash or card. That&rsquo;s it.
        </p>
        <p>
          Rather talk to a person? Call <a className="font-bold text-blue-700 underline" href={`tel:${COMPANY_PHONE_TEL}`}>{COMPANY_PHONE_DISPLAY}</a>{" "}
          &mdash; a real dispatcher answers, {SERVICE_HOURS.toLowerCase()}.
        </p>
      </>
    ),
  },
  {
    q: "How much will it cost?",
    a: (
      <>
        <p>
          The cab&rsquo;s meter sets the fare: {money(FARE_CONFIG.BASE_FARE)} to start, then {money(FARE_CONFIG.PER_MILE)} a mile.
          Each extra passenger is {money(FARE_CONFIG.EXTRA_PAX_FEE)}. Trips outside the local area have a {money(OUT_OF_AREA_MINIMUM_FARE)} minimum.
        </p>
        <p>
          Paying by card adds a {money(FARE_CONFIG.CARD_APP_FEE)} app fee ({money(FARE_CONFIG.CARD_APP_FEE_MEMBER)} with a free account). The price
          shown before you ride is an estimate. <Link to="/compare" className="font-bold text-blue-700 underline">Compare us to Uber &amp; Lyft</Link>.
        </p>
      </>
    ),
  },
  {
    q: "How can I pay?",
    a: <p>Cash to the driver, or a card in the app. With a card, a hold is placed when you book and the final fare is charged after the ride. You can add a tip.</p>,
  },
  {
    q: "Can I book ahead of time?",
    a: (
      <p>
        Yes. Log in (a free account), and when you book tap <strong>Schedule Later</strong> and pick the day and time. Or call us.
        Daily rides to work? Ask about weekly rates.
      </p>
    ),
  },
  {
    q: "How do I cancel?",
    a: (
      <p>
        If you have an account, tap <strong>Cancel this ride</strong> on your ride (Home or My Account). It&rsquo;s free until your driver is
        about {R.headsUpMinutes} minutes away, then {usd(R.lateCancelFee)}. If you booked by phone or as a guest, call{" "}
        <a className="font-bold text-blue-700 underline" href={`tel:${COMPANY_PHONE_TEL}`}>{COMPANY_PHONE_DISPLAY}</a>.
      </p>
    ),
  },
  {
    q: "Service animals, wheelchairs and help getting in",
    a: (
      <>
        <p>Service animals always ride with their owner, at no extra charge. Drivers may not refuse them.</p>
        <p>
          Need a handicap-accessible vehicle? Turn it on when you book, or call, and dispatch will tell you what&rsquo;s available. Tell the driver
          if you need help with the door or bags.
        </p>
      </>
    ),
  },
  {
    q: "Where do you go?",
    a: (
      <p>
        {LOCAL_SERVICE_CITIES.join(", ")}, and {SURROUNDING_SERVICE_CITIES.join(", ")}. Going farther? Call for a price and availability.
      </p>
    ),
  },
  {
    q: "I left something in the cab",
    a: <p>Call the office with the time and place of your ride. We&rsquo;ll pass the message to your driver right away.</p>,
  },
  {
    q: `What is the ${PASS.title}?`,
    a: (
      <p>
        For {PASS.price} you move up the line on every ride until midnight, watch your driver on the map and call them directly (private, no
        numbers shared). Premium members still dispatch first. Choose it when you book, or tap &ldquo;Skip ahead&rdquo; while you wait.
      </p>
    ),
  },
  {
    q: "Can I cancel? Is there a fee?",
    a: (
      <p>
        Cancelling is free until we tell you your driver is about {R.headsUpMinutes} minutes away. After that it costs{" "}
        {usd(R.lateCancelFee)}, which goes to your driver. Once your driver is there, the first {R.waitGraceMinutes} minutes of waiting are
        free; after that waiting time is charged. After {R.noShowAfterMinutes} minutes your driver can cancel as a no-show (
        {usd(R.noShowFee)}). If you need extra time to get to the car, tell us and you won&rsquo;t pay wait or no-show fees.
        <br />
        <br />
        These fees are only for app rides: signed in, ID checked, location on, paying by card. Phone, cash and guest rides are
        sent by our dispatcher, have no cancel or no-show fees, and are cancelled by calling us once a driver is assigned.
      </p>
    ),
  },
  {
    q: "The words are too small",
    a: (
      <p>
        Open the <strong>&#9776; menu</strong> at the top right and turn on <strong>Larger text</strong>. Your phone&rsquo;s own text-size setting works too.
      </p>
    ),
  },
  {
    q: "Is my information safe?",
    a: (
      <p>
        We use it to run your rides and never require you to get promotions. Read the{" "}
        <Link to="/privacy" className="font-bold text-blue-700 underline">Privacy Policy</Link> and{" "}
        <Link to="/terms" className="font-bold text-blue-700 underline">Terms</Link>.
      </p>
    ),
  },
];

export default function Help() {
  return (
    <div className="min-h-screen bg-white">
      <BrandHeader tagline="Help & Questions" />
      <div className="px-5 py-8">
        <div className="max-w-md mx-auto">
          <a
            href={`tel:${COMPANY_PHONE_TEL}`}
            className="flex items-center justify-center gap-2 rounded-2xl bg-blue-600 text-white text-xl font-extrabold min-h-[60px] shadow-md mb-6"
          >
            &#9742; Call us: {COMPANY_PHONE_DISPLAY}
          </a>
          <div className="space-y-3">
            {QA.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border-2 border-slate-200 open:border-blue-400 open:bg-blue-50/40">
                <summary className="flex items-center justify-between gap-3 cursor-pointer list-none px-5 min-h-[60px] text-lg font-bold text-slate-800">
                  {q}
                  <span className="text-2xl text-blue-700 transition group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <div className="px-5 pb-5 space-y-3 text-base leading-relaxed text-slate-700">{a}</div>
              </details>
            ))}
          </div>
          <ContactFooter />
        </div>
      </div>
    </div>
  );
}
