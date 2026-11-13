/* global importScripts, firebase */
// Background call alerts for drivers. The Firebase config arrives in this
// script's URL (public web config, not secrets). Keep the version in step
// with the "firebase" package in package.json.
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.17.0/firebase-messaging-compat.js");

firebase.initializeApp(Object.fromEntries(new URL(self.location.href).searchParams));
firebase.messaging();
