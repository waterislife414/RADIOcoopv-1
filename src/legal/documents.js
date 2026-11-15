// Legal text shown in the app and accepted by riders and drivers.
// DRAFT wording written to the owner's instructions (company promises as
// little as the law allows). It has NOT been reviewed by an attorney: have a
// Georgia/Alabama lawyer check it before real customers rely on it.
// Bump LEGAL_VERSION whenever the wording changes: everyone is asked to
// accept again.
import { BRAND, COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_EMAIL, OFFICE_ADDRESS } from "../config/constants";
import { clock } from "../config/lease";

// One version number for every agreement; bump it in branding.config.json and
// everyone is asked to agree again before their next ride or shift.
export const LEGAL_VERSION = BRAND.policies.legalVersion;
const RR = { headsUpMinutes: 4, minFreeCancelMinutes: 1, lateCancelFee: 5, waitGraceMinutes: 2, noShowAfterMinutes: 7, noShowFee: 10, ...(BRAND.rideRules || {}) };
const PASS = BRAND.copy.dayPass?.title || "Priority Day Pass";
const dollars = (n) => `$${Number(n).toFixed(2)}`;

const lease = BRAND.dispatch?.lease || {};
const money = (cents) => `$${(cents / 100).toFixed(0)}`;
const contact = `${COMPANY_NAME}, ${OFFICE_ADDRESS}. Phone ${COMPANY_PHONE_DISPLAY}${COMPANY_EMAIL ? `. Email ${COMPANY_EMAIL}` : ""}.`;

export const DOCUMENTS = {
  "rider-terms": {
    id: "rider-terms",
    title: "Terms of Service",
    sections: [
      {
        h: "1. Agreeing to these terms",
        p: [
          `These terms are an agreement between you and ${COMPANY_NAME} ("we", "us"). By requesting a ride, creating an account, or using this app or our phone line, you agree to them. If you do not agree, do not use the service.`,
        ],
      },
      {
        h: "2. What we do, and what we don't promise",
        p: [
          "We take ride requests and pass them to drivers. A ride request is only a request. We do not promise that a car will be available, that a driver will accept, that a car will arrive by any time, or that any ride will be started or finished. We are not responsible for late, missed or cancelled pickups.",
          "We may refuse, cancel or end service to anyone, at any time, for any lawful reason, with or without notice. We never refuse service because of a disability or a service animal.",
        ],
      },
      {
        h: "3. Drivers are independent contractors",
        p: [
          `Drivers are independent contractors who lease their vehicles from ${COMPANY_NAME}. They are not our employees or agents. Each driver is responsible for how he or she drives, for his or her own conduct and words, and for obeying traffic and taxi laws.`,
          "To the fullest extent the law allows, we are not responsible for a driver's conduct, words or driving, or for lost or damaged property. Some laws give passengers rights that a contract cannot take away; nothing in these terms takes those rights away.",
        ],
      },
      {
        h: "4. Fares and payment",
        p: [
          "The fare is set by the meter or by the rate quoted for trips outside the local area. Any price shown in the app before the ride is an estimate only.",
          "If you pay by card, a hold may be placed on your card when you book, and the final fare, fees and any tip are charged after the ride. An app fee may apply to card payments.",
          `Cancelling and no-shows on rides booked in the app with an account: you can cancel at no charge until your driver is about ${RR.headsUpMinutes} minutes away, which the app shows on your ride screen (and as a phone alert if you allow alerts), and always for the first ${RR.minFreeCancelMinutes} minute after a driver takes your ride. After that, cancelling costs ${dollars(RR.lateCancelFee)}. When your driver arrives, you get ${RR.waitGraceMinutes} minutes of free waiting; after that the meter runs for waiting time at the posted rate. If you are not at the car ${RR.noShowAfterMinutes} minutes after your driver arrives, your driver may cancel the ride as a no-show and you will be charged ${dollars(RR.noShowFee)}. A no-show fee is only charged when the app shows your driver was at the pickup or next to your phone's shared location. Cancel and no-show fees go to your driver for the trip out.`,
          "Fees are taken from the hold on your card. If the hold can't cover a fee, or you pay from your account balance, it is added to your next card payment in the app. Riders who request an accessible vehicle, or who tell us they need extra time to reach or get into the car, are never charged no-show fees.",
          "The app sends rides to drivers on its own for riders with an account, a checked ID, location sharing on and a card or account balance. Other rides (phone bookings, guests, cash, no location, or an ID we haven't checked yet) are dispatched by our office and are cancelled by calling us. Cancel and no-show fees do not apply to them.",
          `The ${PASS} costs ${dollars(5)}. It moves your rides ahead of riders without priority (members on plans that dispatch first still go first), shows your driver on a map and lets you call your driver, for every ride you book until midnight (local time) on the day you buy it. A guest's pass covers one ride and moves it up the line; the map and calling need a free account. It does not promise a pickup time.`,
          "All rides, memberships and add-on fees, including the Priority Day Pass, are non-refundable once a ride has been dispatched or completed, except where the law requires a refund.",
          `You agree to pay for every ride you take. Refusing to pay, using a fraudulent payment method, or leaving without paying may be theft of services under Georgia law (O.C.G.A. \u00a7 16-8-5) and may be reported to the police. ${COMPANY_NAME} may pursue every legal remedy to recover unpaid fares, fees, court costs and reasonable attorney's fees, and may refuse future service to anyone flagged for non-payment.`,
        ],
      },
      {
        h: "5. Your part",
        p: [
          "Give accurate pickup details and a phone number where you can be reached. Wear a seat belt. Do not bring anything illegal or dangerous into the vehicle, and do not harass or threaten the driver or anyone else.",
          "You are responsible for damage or mess you or your guests cause, and may be charged a cleaning or repair fee. Children must ride with a responsible adult and any child seat the law requires, which you must provide.",
        ],
      },
      {
        h: "5a. Accessibility and service animals",
        p: [
          "Service animals ride with their owners at no extra charge, and riders with disabilities pay the same fares as everyone else. If you need a handicap-accessible vehicle, ask when you book; we will tell you what is available.",
        ],
      },
      {
        h: "5b. Safety",
        p: [
          "In an emergency, call 911 first. Report any accident, injury or problem with a driver to the office as soon as you can.",
        ],
      },
      {
        h: "6. Calls, texts and emails",
        p: [
          "By giving us your phone number or email you agree that we and your driver may call, text or email you about your rides and your account, including by automated means. Message and data rates may apply.",
          "We send promotions only if you choose to receive them. You can stop promotional texts at any time by replying STOP, and promotional emails by using the unsubscribe link. Agreeing to promotions is never required to get a ride.",
          `Calls between you and your driver can go through ${COMPANY_NAME}'s phone number so neither of you sees the other's real number. These calls may be recorded for quality, safety and to settle disputes, and you agree to that recording each time you place or answer such a call. Your driver may not answer while driving.`,
          "Location: rides booked in the app use your phone's location so your driver can find you. While your ride is on and the app is open, your location is shared with your driver until pickup. You can stop sharing at any time; your ride then may be handled by our office like a phone call.",
        ],
      },
      {
        h: "7. Your information",
        p: ["We collect, use, keep and share information as described in our Privacy Policy, which is part of these terms."],
      },
      {
        h: "8. No warranties",
        p: [
          'The app and the service are provided "as is" and "as available". To the fullest extent the law allows, we make no promises or warranties of any kind, including about availability, timing, safety, accuracy, or fitness for any purpose.',
        ],
      },
      {
        h: "9. Limit of our liability",
        p: [
          `To the fullest extent the law allows, ${COMPANY_NAME}, its owners and staff are not liable for any indirect, incidental, special or consequential loss, for missed appointments, flights or work, for lost or damaged property, or for the acts or omissions of any driver or other person.`,
          "If we are found liable for anything, the most we will owe is the fare you paid for the ride in question. Nothing in these terms limits liability that the law does not allow to be limited.",
        ],
      },
      {
        h: "10. Lost items",
        p: ["We are not responsible for items left in a vehicle. If you call us we will pass the message to the driver, but we cannot promise anything will be found or returned."],
      },
      {
        h: "11. Changes, and the law that applies",
        p: [
          "We may change these terms at any time. The current version is always in the app, and using the service after a change means you accept it.",
          "These terms are governed by the laws of the State of Georgia. If you have a problem, please call or write to us first so we can try to fix it. Any lawsuit must be filed in the state or federal courts for Muscogee County, Georgia, except small-claims cases, which may be filed wherever the law allows. If any part of these terms cannot be enforced, the rest still applies.",
          `Questions: ${contact}`,
        ],
      },
    ],
  },

  privacy: {
    id: "privacy",
    title: "Privacy Policy",
    sections: [
      {
        h: "1. What we collect",
        p: [
          "From riders: your name, phone number, email, pickup and drop-off addresses, your location if you choose to share it, ride and payment history, any photo or ID you upload, and messages you send us. Card details are handled by our payment processor; we do not store full card numbers.",
          "From drivers and applicants: contact details, driver's license and license number, driving record (MVR), answers to screening questions, background information, uploaded documents, vehicle inspection photos and videos, damage and repair reports, typed signatures, vehicle and lease records, payments, ride activity, and your location while you are on the board.",
          "Places you booked recently are saved only on your own phone, so you can tap them next time.",
          "During a ride: where your phone was when you booked, your location until pickup if you share it, when your driver arrived and how close to the pickup, your replies such as \u201cI'm at the car,\u201d and records of calls between you and your driver through our number, including recordings.",
          "From everyone: basic device and usage information, such as the type of phone or browser and the pages you open.",
        ],
      },
      {
        h: "2. How we use it",
        p: [
          "To take and dispatch rides, contact you about them, take payment, keep records, prevent fraud and non-payment, keep riders and drivers safe, meet legal duties, run and improve the business, and, if you have agreed, send you promotions.",
        ],
      },
      {
        h: "3. How long we keep it",
        p: [
          "We keep information for as long as we decide we have a business, safety or legal reason to, which may be indefinitely. Some records are cleared automatically on a schedule, but we do not promise to delete anything sooner than the law requires.",
        ],
      },
      {
        h: "4. Who we share it with",
        p: [
          "Drivers and dispatchers, so the ride can happen. Our mechanics, for vehicle inspections and repairs. Companies that work for us, such as payment, hosting and messaging providers. The police, courts, regulators or insurers when we believe it is appropriate or required. A buyer or successor of the business. Anyone else where the law allows it for a legitimate business purpose.",
          "We do not sell your personal information.",
        ],
      },
      {
        h: "5. Security",
        p: ["We take reasonable steps to protect information, but no system is perfectly secure and we cannot guarantee that information will never be seen, lost or misused."],
      },
      {
        h: "6. Your choices",
        p: [
          "You can stop promotional texts by replying STOP and promotional emails with the unsubscribe link. You can deactivate your account from your profile. You can ask us what we hold about you or ask us to correct it by contacting the office; we will respond as the law requires.",
          "Background checks: if we order a background check or driving record from a consumer reporting agency, we will first give you a separate written disclosure and ask for your permission, as federal law requires.",
        ],
      },
      {
        h: "7. Children",
        p: ["The app is not meant for anyone under 18 to use on their own. We do not knowingly collect information from children under 13."],
      },
      {
        h: "8. Changes and contact",
        p: ["We may update this policy at any time; the current version is always in the app.", `Questions: ${contact}`],
      },
    ],
  },

  "driver-agreement": {
    id: "driver-agreement",
    title: "Driver Agreement",
    sections: [
      {
        h: "1. What this is",
        p: [
          `This agreement covers your use of the ${COMPANY_NAME} driver app and the calls sent through it. It works together with your signed vehicle lease. If the two disagree about the lease, the signed lease controls.`,
        ],
      },
      {
        h: "2. You are an independent contractor",
        p: [
          `You are a self-employed independent contractor (1099), not an employee, partner or agent of ${COMPANY_NAME}. You decide when to work and which calls to take. You are responsible for your own taxes. You are not entitled to wages, overtime, benefits, unemployment or workers' compensation from us, except where the law says otherwise.`,
        ],
      },
      {
        h: "3. You are responsible for the vehicle and the ride",
        p: [
          "While the vehicle is leased to you, you take full responsibility for it: for how it is driven, for what happens inside it, for your passengers, and for obeying every traffic, licensing and taxi law that applies.",
          "Before you first drive a vehicle you must do a full inspection in the app: at least 10 photos all the way around and inside, and any damage marked with a photo. Damage that is not in that inspection, or reported with a photo before your first shift in that vehicle, is treated as having happened while the vehicle was leased to you.",
          "You must also do the weekly inspection in the app (the five fluids, tires, brakes, lights, belts, glass, warning lights and the inside of the car) and the quick start-of-shift check. You cannot go on the board until they are done. Your typed name on an inspection is your signature, and it confirms the photos and answers are true.",
          "Report any new damage, accident or mechanical problem (noises, rattles, brakes, leaks, warning lights) in the app right away, with a photo when you can. Do not drive a vehicle you believe is unsafe; call the office.",
          "You are responsible for keeping the vehicle clean and in good running order: checking and topping off fluids, keeping tires properly filled, and reporting needed repairs. Repairs are done by our shop or a shop we approve. You pay for damage you cause, including accidents you cause, and for damage from misuse, neglect or failing to report a problem. Who pays for repairs from normal wear is set out in your signed lease.",
          `You agree to pay every ticket, citation, toll, fine, towing or impound charge that arises while the vehicle is in your care, including any that are mailed later to ${COMPANY_NAME} or the owner, and to pay us back for any we have to pay.`,
          "You must tell the office right away about any accident, damage, injury, arrest or complaint. Insurance, deductibles and anything not covered here are set out in your signed lease.",
        ],
      },
      {
        h: "3a. How you treat passengers",
        p: [
          "Treat every passenger with courtesy. No harassment, threats, insults, unwanted contact, discrimination, or unsafe driving. You are responsible for what you say and do.",
          "You must give rides to people with disabilities and their service animals, at the normal fare, and help with mobility aids as the law requires. Allergies or fear of dogs are not lawful reasons to refuse a service animal. Refusing is grounds for removal.",
          "Never drive impaired. No alcohol, marijuana or illegal drugs before or during a shift, and no smoking or vaping in the vehicle.",
        ],
      },
      {
        h: "4. The daily lease",
        p: [
          `The lease is ${money(lease.dailyCents || 7500)} for each day you go on the board, due between ${clock(lease.dueStart || "14:00")} and ${clock(lease.dueEnd || "16:00")}. Card fares and tips paid through the company count toward it. Anything above the lease stays on your account as credit toward future lease days; it is not paid out while you are driving for us.`,
          `If the lease is not covered you must put the difference in your envelope and log it in the app. If it is not logged by the end of the due time, you are taken off the board until it is. If you leave for any reason, your final day's lease and anything you owe are taken from your credit first, and you are then paid ${lease.exitPayoutPct || 50}% of what remains, by check.`,
        ],
      },
      {
        h: "5. No promise of calls, and ending the relationship",
        p: [
          "We do not promise any number of calls or any level of earnings.",
          "Either of us may end this relationship at any time, with or without a reason and with or without notice. We may also suspend or remove your access to the app or the board at any time.",
        ],
      },
      {
        h: "6. App rules",
        p: [
          "To be on the board you must share your phone's location, and you may only check ready in the zone you are actually in. Missing or turning down a call when you are next up takes you off the board and puts a warning on your profile; warnings, write-ups and incidents recorded by the office stay on your profile and affect your score. A low score can limit the calls you are offered.",
        ],
      },
      {
        h: "7. Your information, location and messages",
        p: [
          "You agree that we may collect, keep, use and share your information as described in the Privacy Policy, including your location while you are on the board, your license and driving record, and your lease, payment and ride records, for as long as we choose.",
          "Calls with riders through the company's number may be recorded for quality, safety and to settle disputes, and you agree to that recording. Never give a rider a reason to call your own phone. Tap \u201cI'm here\u201d only when you are at the pickup: the app records how close you were, and a no-show fee is only charged to the rider when you were there. Cancel and no-show fees collected on your calls are credited to your lease. Card fees, memberships and the Priority Day Pass belong to the company.",
          "You agree to receive calls, texts, emails and app alerts about calls, your lease and your account. These are part of the job and cannot be turned off while you drive for us. Promotional messages are sent only if you choose them, and you can stop those at any time by replying STOP.",
        ],
      },
      {
        h: "8. Protecting the company",
        p: [
          `To the fullest extent the law allows, you agree to defend and pay back ${COMPANY_NAME}, its owners and staff for any claim, loss, fine or cost that comes from your driving, your conduct or words, damage you cause to the vehicle or anyone's property, your passengers, or your breaking this agreement or the law.`,
        ],
      },
      {
        h: "9. Changes, and the law that applies",
        p: [
          "We may change this agreement at any time; you will be asked to accept the new version in the app. It is governed by the laws of the State of Georgia. If any part cannot be enforced, the rest still applies.",
          `Questions: ${contact}`,
        ],
      },
    ],
  },

  // FCRA: this must be shown on its own, with nothing else on the page but the authorization.
  "background-check": {
    id: "background-check",
    title: "Disclosure Regarding Background Investigation",
    sections: [
      {
        h: "Disclosure",
        p: [
          `${COMPANY_NAME} may obtain a consumer report about you from a consumer reporting agency to decide whether to contract with you as a driver and, if you drive for us, at any time while you do. The report may include your driving record (motor vehicle record), criminal history, identity verification and other public records.`,
        ],
      },
      {
        h: "Authorization",
        p: [
          `I authorize ${COMPANY_NAME} to obtain consumer reports about me for these purposes, now and while I drive for the company.`,
        ],
      },
    ],
  },
};

/** Record saved when someone accepts: which documents, which version, when. */
export function consentRecord(docIds, marketingOptIn) {
  return { docs: docIds, version: LEGAL_VERSION, acceptedAt: Date.now(), marketingOptIn: !!marketingOptIn };
}
export const consentIsCurrent = (record, docIds) =>
  !!record && record.version === LEGAL_VERSION && docIds.every((d) => (record.docs || []).includes(d));
