# Creator Rivo — এখন রিয়েল মাল্টি-পেজ সাইট

SPA (single `index.html` + client-side রাউটার) বাদ দিয়ে এখন প্রতিটা সেকশন
একটা করে **আসল, আলাদা `.html` ফাইল**। ব্রাউজারের ঠিকানা বার, রিফ্রেশ,
ব্যাক/ফরওয়ার্ড বাটন, শেয়ার লিংক, বুকমার্ক — সবকিছু স্বাভাবিকভাবে কাজ করবে,
কারণ প্রতিটা লিংক এখন সত্যিকারের `<a href="...">`।

## গঠন

```
index.html          হোম
login.html           লগ ইন / রেজিস্ট্রেশন
cart.html            কার্ট
all-courses.html      all-products.html      software.html      videos.html
detail.html           ?type=courses&id=xxx দিয়ে যেকোনো আইটেম দেখায়
profile.html   settings.html   wallet.html   orders.html   mydownloads.html
support.html   notice.html     live.html     premium.html  about.html
download.html  more.html

css/style.css          (অপরিবর্তিত)
js/common.js           সব পেজ শেয়ার করে: Firebase init, লগইন স্টেট, কার্ট
                        (localStorage-এ থাকে যাতে পেজ বদলালেও কার্ট না হারায়),
                        হেডার/ট্যাববার ওয়্যারিং, কার্ড রেন্ডারার
js/pages/*.js           প্রতিটা পেজের নিজস্ব লজিক (একই নামের .html-এর জন্য)
```

## যা বদলেছে (আগের SPA-র তুলনায়)

- **কোনো `fetch()`-দিয়ে পেজ-ইনজেকশন নেই** — আগে সব ১৯টা "পেজ" fetch করে
  একটা `<div id="pagesRoot">`-এ ঢোকানো হতো, সব `.page.active` ক্লাস
  টগল করে দেখানো হতো। এখন প্রতিটা URL সত্যিকারের আলাদা ফাইল লোড করে।
- **প্রোডাক্ট/কোর্স কার্ড ক্লিক করলে** এখন `detail.html?type=courses&id=...`
  — রিয়েল URL, শেয়ারযোগ্য, রিফ্রেশ করলেও কাজ করে।
- **কার্ট** আগে জাভাস্ক্রিপ্ট ভ্যারিয়েবলে (মেমোরিতে) থাকতো, পেজ রিলোড হলে
  হারিয়ে যেত (SPA-তে সমস্যা হতো না কারণ রিলোড হতোই না)। এখন
  `localStorage`-এ থাকে, তাই পেজ থেকে পেজে গেলেও কার্ট ঠিক থাকে।
- **লগইন-দরকার পেজ** (settings/orders/mydownloads/wallet) — লগইন ছাড়া
  সরাসরি URL-এ গেলে JS নিজে থেকে `login.html`-এ পাঠিয়ে দেয়।
- **ব্যাক বাটন** এখন স্বাভাবিক ব্রাউজার হিস্ট্রি ব্যবহার করে; আগের মতো
  আলাদা `detailReturnTo` ভ্যারিয়েবল রাখতে হয়নি।

## চালানো

যেকোনো স্ট্যাটিক ফাইল সার্ভার দিয়ে সার্ভ করুন (ES modules + Firebase CDN
ব্যবহারের কারণে সরাসরি `file://` দিয়ে খুললে কাজ নাও করতে পারে —
CORS/module ব্লক করে ব্রাউজার):

```
npx serve .
# অথবা
python3 -m http.server 8000
```

তারপর `http://localhost:8000/index.html` খুলুন। Firebase config এবং
Firestore কালেকশনের নাম/স্ট্রাকচার আগের মতোই অপরিবর্তিত আছে, তাই একই
Firebase প্রজেক্ট/ডেটা কাজ করবে — শুধু কোনো কোড বদলাতে হবে না।
