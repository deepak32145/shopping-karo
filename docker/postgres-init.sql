-- One logical database per service (auth and user data live in MongoDB, see DESIGN.md)
CREATE DATABASE sk_inventory;
CREATE DATABASE sk_order;
CREATE DATABASE sk_payment;
CREATE DATABASE sk_notification;
