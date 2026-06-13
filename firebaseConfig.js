import { initializeApp } from 'firebase/app';
import { getDatabase } from 'firebase/database';

const firebaseConfig = {
  apiKey: "AIzaSyDt6qbM8hfgXlhbLAaRnl2gG8htZtz9J9s",
  authDomain: "tagroutine.firebaseapp.com",
  databaseURL: "https://tagroutine-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "tagroutine",
  storageBucket: "tagroutine.firebasestorage.app",
  messagingSenderId: "979077517236",
  appId: "1:979077517236:web:260fcfe9c03b0287252ce1",
};

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
