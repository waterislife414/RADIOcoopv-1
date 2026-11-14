// Legal text shown in the app and accepted by riders and drivers.
// DRAFT wording written to the owner's instructions (company promises as
// little as the law allows). It has NOT been reviewed by an attorney: have a
// Georgia/Alabama lawyer check it before real customers rely on it.
// Bump LEGAL_VERSION whenever the wording changes: everyone is asked to
// accept again.
import { BRAND, COMPANY_NAME, COMPANY_PHONE_DISPLAY, COMPANY_EMAIL, OFFICE_ADDRESS } from "../config/constants";
import { clock } from "../config/lease";

export const LEGAL_VERSION = "2026-11-14";

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
          "We take ride requests and pass them to drivers. A ride request is only a request. We do not promise that a car will be available, that a driver will accept, that a car will arrive by any time, or that any ride will be started or finished.",
          "We may refuse, cancel or end service to anyone, at any time, for any lawful reason, with or without notice.",
        ],
      },
      {
        h: "3. Drivers are independent contractors",
        p: [
          `Drivers are independent contractors who lease their vehicles. They are not employees or agents of ${COMPANY_NAME}. Each driver is responsible for how the vehicle is driven and for what happens during the ride.`,
          "To the fullest extent the law allows, any claim about a ride, a driver's conduct, an accident, an injury, or lost or damaged property is between you and the driver, not us.",
        ],
      },
      {
        h: "4. Fares and payment",
        p: [
          "The fare is set by the meter or by the rate quoted for trips outside the local area. Any price shown in the app before the ride is an estimate only.",
          "If you pay by card, a hold may be placed on your card when you book, and the final fare, fees and any tip are charged after the ride. An app fee may apply to card payments.",
          "All rides, memberships and add-on fees are non-refundable once a ride has been dispatched or completed, except where the law requires a refund.",
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
        h: "6. Calls, texts and emails",
        p: [
          "By giving us your phone number or email you agree that we and your driver may call, text or email you about your rides and your account, including by automated means. Message and data rates may apply.",
          "We send promotions only if you choose to receive them. You can stop promotional texts at any time by replying STOP, and promotional emails by using the unsubscribe link. Agreeing to promotions is never required to get a ride.",
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
          "These terms are governed by the laws of the State of Georgia. If any part cannot be enforced, the rest still applies.",
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
          "From drivers and applicants: contact details, driver's license, driving record and background information, uploaded documents, vehicle and lease records, payments, ride activity, and your location while you are on the board.",
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
          "Drivers and dispatchers, so the ride can happen. Companies that work for us, such as payment, hosting and messaging providers. The police, courts, regulators or insurers when we believe it is appropriate or required. A buyer or successor of the business. Anyone else where the law allows it for a legitimate business purpose.",
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
        ],
      },
      {
        h: "7. Children",
        p: ["The app is not meant for anyone under 18 to use on their own."],
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
          "While the vehicle is leased to you, you are responsible for how it is driven, for your passengers, and for obeying every traffic, licensing and taxi law that applies.",
          `You agree to pay every ticket, citation, toll, fine, towing or impound charge that arises while the vehicle is in your care, including any that are mailed later to ${COMPANY_NAME} or the owner, and to pay us back for any we have to pay.`,
          "You must tell the office right away about any accident, damage, injury, arrest or complaint. Responsibility for accidents and damage is set out in your signed lease.",
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
          "You agree to receive calls, texts, emails and app alerts about calls, your lease and your account. These are part of the job and cannot be turned off while you drive for us. Promotional messages are sent only if you choose them, and you can stop those at any time by replying STOP.",
        ],
      },
      {
        h: "8. Protecting the company",
        p: [
          `To the fullest extent the law allows, you agree to defend and pay back ${COMPANY_NAME}, its owners and staff for any claim, loss, fine or cost that comes from your driving, your conduct, your passengers, or your breaking this agreement or the law.`,
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
};

/** Record saved when someone accepts: which documents, which version, when. */
export function consentRecord(docIds, marketingOptIn) {
  return { docs: docIds, version: LEGAL_VERSION, acceptedAt: Date.now(), marketingOptIn: !!marketingOptIn };
}
export const consentIsCurrent = (record, docIds) =>
  !!record && record.version === LEGAL_VERSION && docIds.every((d) => (record.docs || []).includes(d));
