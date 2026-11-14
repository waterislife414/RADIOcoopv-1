import branding from "../../branding.config.json";

const lease = (branding.dispatch.lease.dailyCents / 100).toFixed(0);
const years = branding.policies.mvrLookbackYears;

/**
 * Page 2 of the driver application. `flag` is the answer the office should
 * look at more closely; it does not automatically turn anyone down.
 * Wording should be reviewed by Malcolm's lawyer before going live.
 */
export const SCREENING_QUESTIONS = [
  { id: "publicPassengers", flag: "no", text: "Are you comfortable driving members of the public you haven't met before, including at night and on weekends?" },
  { id: "leaseTerms", flag: "no", text: `Do you understand that drivers are independent contractors (1099) who lease a company vehicle at $${lease} per day?` },
  { id: "zeroTolerance", flag: "no", text: "Will you follow a zero-tolerance policy: no alcohol, marijuana or illegal drugs before or during a shift, and no smoking or vaping in the vehicle?" },
  { id: "drugTest", flag: "no", text: "Can you pass a drug screening for any substance that is not prescribed to you?" },
  { id: "dui", flag: "yes", text: `In the past ${years} years, have you been convicted of driving under the influence (DUI/DWI)?` },
  { id: "pendingCharges", flag: "yes", text: "Do you currently have any pending criminal charges?" },
  { id: "awaitingTrial", flag: "yes", text: "Are you currently awaiting trial or sentencing on any case?" },
  { id: "probation", flag: "yes", text: "Are you currently on probation or parole?" },
];

export const flaggedAnswers = (answers = {}) =>
  SCREENING_QUESTIONS.filter((q) => answers[q.id] === q.flag);
