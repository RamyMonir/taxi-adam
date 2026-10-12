// Giving a ride to a driver: who drives, the car he holds right now (snapshot: what the customer sees, what the report shows).
import { vehicleSnapshot, carName } from "./cars.js";

// the driver who takes the ride + the car he holds right now (snapshot: what the customer sees, what the report shows)
export function assign(r, drv, car) {
  const d = r.data;
  d.driverId = drv.id; d.chat = drv.chat_id;
  setVehicle(r, drv, car);
  d.listing = drv.listing ?? null;   // his Google listing for the review link after the ride
  const o = d.offers && d.offers[drv.id];
  if (o && o.msg) r.tg_msg = o.msg;
}
export function setVehicle(r, drv, car) {
  const d = r.data, v = vehicleSnapshot(car);
  d.vehicle = v;
  d.driver = { name: drv.name || "", car: v ? carName(v) : drv.car || "", color: v ? v.color : drv.color || "", plate: v ? v.plate : drv.plate || "",
               phone: drv.phone || "", photo: !!(drv.photo_key && drv.photo_ok) };
}
