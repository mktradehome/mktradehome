self.addEventListener("install", event => {

  self.skipWaiting();

});

self.addEventListener("activate", event => {

  event.waitUntil(self.clients.claim());

});

self.addEventListener("push", event => {

  let data = {

    title: "Mktradehome Alert",

    body: "Your trading dashboard has a new alert.",

    url: "/"

  };

  if (event.data) {

    try {

      data = { ...data, ...event.data.json() };

    } catch (error) {}

  }

  event.waitUntil(

    self.registration.showNotification(data.title, {

      body: data.body,

      icon: "/icon-192.png",

      badge: "/icon-192.png",

      data: { url: data.url }

    })

  );

});

self.addEventListener("notificationclick", event => {

  event.notification.close();

  event.waitUntil(

    clients.openWindow(event.notification.data.url || "/")

  );

});
