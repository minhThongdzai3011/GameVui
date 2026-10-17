#!/usr/bin/env node
/**
 * Dữ liệu cúp châu Á mùa 2026/27 (C1 = AFC Champions League Elite, C2 = AFC Champions League Two),
 * tra cứu ngày 2026-10-17 từ Wikipedia "2026–27 AFC Champions League Elite / Two", the-afc.com và
 * báo Việt Nam (VOV, VFF, Tuổi Trẻ…). Mã CLB, màu áo, trình độ (tier 1–5) và một số tên sân là ước
 * lượng của mình (đánh dấu "?" trong ghi chú).
 *
 *   node scripts/afc-source.mjs   → data/afc.json (build-game-data.mjs gộp vào game-data.js)
 */
import { writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
// [tên, quốc gia, khu vực, mã, sân, [màu chính, màu phụ], tier]
const CLUBS = [
  // C1 – khu vực Tây
  ["Al-Hilal", "Ả Rập Xê Út", "West", "HIL", "Kingdom Arena (Riyadh)", ["#0047ab", "#ffffff"], 5],
  ["Al-Nassr", "Ả Rập Xê Út", "West", "NSR", "Al-Awwal Park (Riyadh)", ["#ffd100", "#0033a0"], 5],
  ["Al-Ahli", "Ả Rập Xê Út", "West", "AHL", "King Abdullah Sports City (Jeddah)", ["#00703c", "#ffffff"], 5],
  ["Al-Ittihad", "Ả Rập Xê Út", "West", "ITT", "King Abdullah Sports City (Jeddah)", ["#ffd100", "#1a1a1a"], 5],
  ["Al-Qadsiah", "Ả Rập Xê Út", "West", "QAD", "Prince Saud bin Jalawi Stadium (Khobar)", ["#e30613", "#ffd200"], 4],
  ["Al Ain", "UAE", "West", "AIN", "Hazza bin Zayed Stadium", ["#5b2c83", "#ffffff"], 4],
  ["Shabab Al Ahli", "UAE", "West", "SAH", "Rashid Stadium (Dubai)", ["#d71920", "#1a1a1a"], 4],
  ["Al Wasl", "UAE", "West", "WAS", "Zabeel Stadium (Dubai)", ["#ffd100", "#1a1a1a"], 4],
  ["Al Sadd", "Qatar", "West", "SAD", "Jassim bin Hamad Stadium (Doha)", ["#f4f4f4", "#1a1a1a"], 4],
  ["Al-Gharafa", "Qatar", "West", "GHA", "Thani bin Jassim Stadium (Doha)", ["#ffd100", "#003da5"], 4],
  ["Al-Shamal", "Qatar", "West", "SHM", "Al-Shamal SC Stadium", ["#1e73be", "#ffffff"], 3],
  ["Esteghlal", "Iran", "West", "EST", "Azadi Stadium (Tehran)", ["#0033a0", "#ffffff"], 4],
  ["Tractor", "Iran", "West", "TRA", "Yadegar-e Emam Stadium (Tabriz)", ["#e30613", "#ffffff"], 4],
  ["Neftchi Fergana", "Uzbekistan", "West", "NEF", "Istiqlol Stadium (Fergana)", ["#f4f4f4", "#0057b8"], 3],
  ["Pakhtakor", "Uzbekistan", "West", "PAK", "Pakhtakor Central Stadium (Tashkent)", ["#00a651", "#ffffff"], 3],
  ["Al-Quwa Al-Jawiya", "Iraq", "West", "QWJ", "Al-Madina Stadium (Baghdad)", ["#0072ce", "#ffffff"], 3],
  // C1 – khu vực Đông
  ["Kashima Antlers", "Nhật Bản", "East", "KAS", "Mercari Stadium (Kashima)", ["#b0122b", "#0b1f3f"], 5],
  ["Kashiwa Reysol", "Nhật Bản", "East", "KSW", "Sankyo Frontier Kashiwa Stadium", ["#ffe100", "#1a1a1a"], 4],
  ["Kyoto Sanga", "Nhật Bản", "East", "KYO", "Sanga Stadium by Kyocera", ["#5a1f7a", "#ffffff"], 4],
  ["Vissel Kobe", "Nhật Bản", "East", "KOB", "Noevir Stadium Kobe", ["#8b0020", "#1a1a1a"], 5],
  ["Gamba Osaka", "Nhật Bản", "East", "GAM", "Panasonic Stadium Suita", ["#0047ab", "#1a1a1a"], 4],
  ["Jeonbuk Hyundai Motors", "Hàn Quốc", "East", "JEO", "Jeonju World Cup Stadium", ["#00653a", "#ffffff"], 5],
  ["Daejeon Hana Citizen", "Hàn Quốc", "East", "DJN", "Daejeon World Cup Stadium", ["#5b2b82", "#00a651"], 4],
  ["Pohang Steelers", "Hàn Quốc", "East", "POH", "Pohang Steel Yard", ["#e2231a", "#1a1a1a"], 4],
  ["Shanghai Port", "Trung Quốc", "East", "SHP", "Pudong Football Stadium", ["#c8102e", "#ffffff"], 4],
  ["Beijing Guoan", "Trung Quốc", "East", "BJG", "Workers' Stadium (Beijing)", ["#00843d", "#ffffff"], 4],
  ["Buriram United", "Thái Lan", "East", "BRU", "Chang Arena (Buriram)", ["#0b2d84", "#f5a800"], 3],
  ["Port FC", "Thái Lan", "East", "PFC", "PAT Stadium (Bangkok)", ["#0055a4", "#f47920"], 3],
  ["Ratchaburi", "Thái Lan", "East", "RAT", "Dragon Solar Park (Ratchaburi)", ["#1d4e9e", "#e31b23"], 2],
  ["Newcastle Jets", "Úc", "East", "NEW", "McDonald Jones Stadium (Newcastle)", ["#0b2a5b", "#e11b22"], 3],
  ["Johor Darul Ta'zim", "Malaysia", "East", "JDT", "Sultan Ibrahim Stadium (Iskandar Puteri)", ["#e2231a", "#002d72"], 3],
  // C2 – Tây
  ["Al Wahda", "UAE", "West", "WAH", "Al Nahyan Stadium (Abu Dhabi)", ["#8c1d40", "#ffffff"], 4],
  ["Al-Kuwait", "Kuwait", "West", "KUW", "Al-Kuwait SC Stadium (Kaifan)", ["#f4f4f4", "#c8102e"], 3],
  ["Nasaf", "Uzbekistan", "West", "NSF", "Markaziy Stadium (Qarshi)", ["#0066b3", "#ffffff"], 3],
  ["Al-Khaldiya", "Bahrain", "West", "KHL", "Khalifa Sports City Stadium (Isa Town)", ["#006c35", "#ffffff"], 2],
  ["Al Jazira", "UAE", "West", "JAZ", "Mohammed Bin Zayed Stadium (Abu Dhabi)", ["#d71920", "#1a1a1a"], 4],
  ["Al-Muharraq", "Bahrain", "West", "MUH", "Al Muharraq Stadium", ["#d71920", "#ffffff"], 2],
  ["Arkadag", "Turkmenistan", "West", "ARK", "Arkadag Stadium", ["#009a44", "#ffffff"], 2],
  ["Gol Gohar Sirjan", "Iran", "West", "GGS", "Imam Ali Stadium (Sirjan)", ["#f47b20", "#1a1a1a"], 3],
  ["Al-Taawoun", "Ả Rập Xê Út", "West", "TAA", "King Abdullah Sport City (Buraydah)", ["#ffd100", "#003da5"], 4],
  ["Al-Faisaly", "Jordan", "West", "FAI", "Amman International Stadium", ["#0055a4", "#ffffff"], 3],
  ["Al-Rayyan", "Qatar", "West", "RAY", "Ahmad bin Ali Stadium (Al Rayyan)", ["#e30613", "#1a1a1a"], 4],
  ["Al-Nahda", "Oman", "West", "NAH", "Al-Buraimi Stadium", ["#0b5fa5", "#ffffff"], 2],
  ["Al-Shorta", "Iraq", "West", "SHO", "Al-Shorta Stadium (Baghdad)", ["#009739", "#ffffff"], 3],
  ["Al-Hussein", "Jordan", "West", "HUS", "Al-Hassan Stadium (Irbid)", ["#ffd100", "#003da5"], 3],
  ["East Bengal", "Ấn Độ", "West", "EBG", "Salt Lake Stadium (Kolkata)", ["#e30613", "#ffd100"], 2],
  ["Al-Seeb", "Oman", "West", "SEB", "Al-Seeb Stadium", ["#1e5aa8", "#ffd100"], 2],
  // C2 – Đông
  ["FC Seoul", "Hàn Quốc", "East", "SEO", "Seoul World Cup Stadium", ["#c8102e", "#1a1a1a"], 4],
  ["Melbourne Victory", "Úc", "East", "MVC", "AAMI Park (Melbourne)", ["#002b5c", "#ffffff"], 3],
  ["Persib Bandung", "Indonesia", "East", "PSB", "Gelora Bandung Lautan Api Stadium", ["#0055a4", "#ffffff"], 2],
  ["BG Pathum United", "Thái Lan", "East", "BGP", "BG Stadium (Pathum Thani)", ["#1a3c8f", "#ffffff"], 3],
  ["Adelaide United", "Úc", "East", "ADL", "Coopers Stadium (Adelaide)", ["#d71920", "#0a1f44"], 3],
  ["Lion City Sailors", "Singapore", "East", "LCS", "Bishan Stadium", ["#d71920", "#ffffff"], 3],
  ["Tai Po", "Hồng Kông", "East", "TPO", "Tai Po Sports Ground", ["#00843d", "#f47920"], 2],
  ["Machida Zelvia", "Nhật Bản", "East", "MAC", "Machida GION Stadium", ["#002e6d", "#ffffff"], 4],
  ["Shanghai Shenhua", "Trung Quốc", "East", "SHS", "Shanghai Stadium", ["#0033a0", "#ffffff"], 4],
  ["Tampines Rovers", "Singapore", "East", "TAM", "Our Tampines Hub", ["#ffd100", "#009a44"], 2],
  ["Preah Khan Reach Svay Rieng", "Campuchia", "East", "PKR", "Svay Rieng Stadium", ["#003da5", "#ffffff"], 2],
  ["Gangwon FC", "Hàn Quốc", "East", "GAN", "Gangneung Stadium", ["#f26522", "#002f6c"], 4],
  ["Kuching City", "Malaysia", "East", "KCH", "Sarawak State Stadium (Kuching)", ["#e30613", "#ffd100"], 2],
  ["Kitchee", "Hồng Kông", "East", "KIT", "Mong Kok Stadium", ["#0055a4", "#ffffff"], 2],
  ["Phnom Penh Crown", "Campuchia", "East", "PPC", "RSN Stadium (Phnom Penh)", ["#c8102e", "#ffd700"], 2],
];
const VN = { "Công An Hà Nội": "cong-an-ha-noi", "Thể Công–Viettel": "the-cong-viettel" };
const slug = (name) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ']/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const id = (name) => VN[name] || slug(name);

// C1 khu vực Đông: 8 đối thủ thật của mỗi đội theo thứ tự lượt (H = sân nhà), từ lễ bốc thăm 18/8/2026
const EAST = {
  "Kashima Antlers": "Newcastle Jets H|Công An Hà Nội A|Pohang Steelers H|Buriram United A|Jeonbuk Hyundai Motors H|Port FC A|Daejeon Hana Citizen A|Ratchaburi H",
  "Kashiwa Reysol": "Jeonbuk Hyundai Motors A|Port FC H|Ratchaburi A|Daejeon Hana Citizen H|Newcastle Jets A|Công An Hà Nội H|Buriram United H|Pohang Steelers A",
  "Kyoto Sanga": "Daejeon Hana Citizen A|Ratchaburi H|Newcastle Jets H|Công An Hà Nội A|Pohang Steelers H|Buriram United A|Jeonbuk Hyundai Motors H|Port FC A",
  "Vissel Kobe": "Port FC A|Jeonbuk Hyundai Motors H|Daejeon Hana Citizen A|Ratchaburi H|Công An Hà Nội A|Newcastle Jets H|Pohang Steelers H|Buriram United A",
  "Gamba Osaka": "Công An Hà Nội H|Newcastle Jets A|Buriram United H|Pohang Steelers A|Port FC H|Jeonbuk Hyundai Motors A|Ratchaburi A|Daejeon Hana Citizen H",
  "Jeonbuk Hyundai Motors": "Kashiwa Reysol H|Vissel Kobe A|Beijing Guoan A|Johor Darul Ta'zim H|Kashima Antlers A|Gamba Osaka H|Kyoto Sanga A|Shanghai Port H",
  "Daejeon Hana Citizen": "Kyoto Sanga H|Shanghai Port A|Vissel Kobe H|Kashiwa Reysol A|Beijing Guoan H|Johor Darul Ta'zim A|Kashima Antlers H|Gamba Osaka A",
  "Pohang Steelers": "Beijing Guoan A|Johor Darul Ta'zim H|Kashima Antlers A|Gamba Osaka H|Kyoto Sanga A|Shanghai Port H|Vissel Kobe A|Kashiwa Reysol H",
  "Shanghai Port": "Ratchaburi A|Daejeon Hana Citizen H|Công An Hà Nội H|Newcastle Jets A|Buriram United H|Pohang Steelers A|Port FC H|Jeonbuk Hyundai Motors A",
  "Beijing Guoan": "Pohang Steelers H|Buriram United A|Jeonbuk Hyundai Motors H|Port FC A|Daejeon Hana Citizen A|Ratchaburi H|Công An Hà Nội A|Newcastle Jets H",
  "Buriram United": "Johor Darul Ta'zim A|Beijing Guoan H|Gamba Osaka A|Kashima Antlers H|Shanghai Port A|Kyoto Sanga H|Kashiwa Reysol A|Vissel Kobe H",
  "Port FC": "Vissel Kobe H|Kashiwa Reysol A|Johor Darul Ta'zim A|Beijing Guoan H|Gamba Osaka A|Kashima Antlers H|Shanghai Port A|Kyoto Sanga H",
  Ratchaburi: "Shanghai Port H|Kyoto Sanga A|Kashiwa Reysol H|Vissel Kobe A|Johor Darul Ta'zim H|Beijing Guoan A|Gamba Osaka H|Kashima Antlers A",
  "Newcastle Jets": "Kashima Antlers A|Gamba Osaka H|Kyoto Sanga A|Shanghai Port H|Kashiwa Reysol H|Vissel Kobe A|Johor Darul Ta'zim H|Beijing Guoan A",
  "Johor Darul Ta'zim": "Buriram United H|Pohang Steelers A|Port FC H|Jeonbuk Hyundai Motors A|Ratchaburi A|Daejeon Hana Citizen H|Newcastle Jets A|Công An Hà Nội H",
  "Công An Hà Nội": "Gamba Osaka A|Kashima Antlers H|Shanghai Port A|Kyoto Sanga H|Vissel Kobe H|Kashiwa Reysol A|Beijing Guoan H|Johor Darul Ta'zim A",
};
const schedule = [];
const check = new Map();
for (const [team, list] of Object.entries(EAST)) {
  list.split("|").forEach((x, i) => {
    const m = /^(.+) ([HA])$/.exec(x);
    const opp = m[1];
    if (!EAST[opp]) throw new Error(`không rõ đội ${opp}`);
    const [h, a] = m[2] === "H" ? [team, opp] : [opp, team];
    const key = `${i}-${h}-${a}`;
    check.set(key, (check.get(key) || 0) + 1);
    if (m[2] === "H") schedule.push([i + 1, id(h), id(a)]);
  });
}
for (const [k, n] of check) if (n !== 2) throw new Error(`lịch C1 không khớp hai chiều: ${k}`);
const WEST = CLUBS.filter((c) => c[2] === "West").slice(0, 16).map((c) => id(c[0]));

// C2: thứ tự trong bảng [t0, t1, t2, t3] sao cho lượt 1 = t0–t1, t2–t3; lượt 2 = t3–t0, t1–t2 (khớp kết quả thật)
const GROUPS = {
  A: ["Al Wahda", "Al-Kuwait", "Al-Khaldiya", "Nasaf"],
  B: ["Al Jazira", "Arkadag", "Al-Muharraq", "Gol Gohar Sirjan"],
  C: ["Al-Taawoun", "Al-Rayyan", "Al-Faisaly", "Al-Nahda"],
  D: ["Al-Shorta", "Al-Seeb", "Al-Hussein", "East Bengal"],
  E: ["Thể Công–Viettel", "Melbourne Victory", "FC Seoul", "Persib Bandung"],
  F: ["Adelaide United", "Tai Po", "Lion City Sailors", "BG Pathum United"],
  G: ["Machida Zelvia", "Preah Khan Reach Svay Rieng", "Shanghai Shenhua", "Tampines Rovers"],
  H: ["Phnom Penh Crown", "Kuching City", "Kitchee", "Gangwon FC"],
};
const out = {
  season: 2026,
  source: "Wikipedia 2026–27 AFC Champions League Elite / Two, the-afc.com, VOV, VFF (tra cứu 2026-10-17)",
  clubs: CLUBS.map(([name, country, region, code, venue, colors, tier]) => ({ id: id(name), name, country, region, code, venue, colors, tier, rep: 35 + tier * 9, capacity: 20000, coach: "—" })),
  // mùa đầu: Việt Nam có 1 suất play-off C1 (vô địch V.League 1) và 1 suất vòng bảng C2 (á quân)
  vn: { acle: ["cong-an-ha-noi"], acl2: ["the-cong-viettel"] },
  acle: { east: Object.keys(EAST).map(id), west: WEST, eastSchedule: schedule, prelimOpp: id("Adelaide United") },
  acl2: { groups: Object.fromEntries(Object.entries(GROUPS).map(([g, t]) => [g, t.map(id)])) },
};
for (const list of [out.acle.east, out.acle.west, ...Object.values(out.acl2.groups)])
  for (const x of list) if (!Object.values(VN).includes(x) && !out.clubs.some((c) => c.id === x)) throw new Error(`thiếu CLB ${x}`);
await writeFile(join(root, "data", "afc.json"), JSON.stringify(out, null, 1) + "\n");
console.log(`data/afc.json: ${out.clubs.length} CLB nước ngoài, lịch C1 khu Đông ${schedule.length} trận, ${Object.keys(GROUPS).length} bảng C2`);
