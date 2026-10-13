import type { CitySeed, PoiSeed } from "./seed.types";

type PoiInput = {
  key: string;
  name: string;
  type: "attraction" | "food";
  lat: number;
  lng: number;
  tags?: string[];
  address?: string;
  open_hours?: string;
  ticket?: string;
  description?: string;
  tips?: string;
  best_time?: string;
  price_level?: string;
  avg_duration_min?: number;
  rating?: number;
};

function pois(cityId: string, items: PoiInput[]): PoiSeed[] {
  return items.map(({ key, type, tags = [], address = "", ...rest }) => ({
    id: `poi_${cityId}_${key}`,
    type,
    tags,
    address,
    open_hours: rest.open_hours ?? (type === "food" ? "10:00-22:00" : "全天"),
    ticket: rest.ticket ?? (type === "food" ? "" : "免费"),
    avg_duration_min: rest.avg_duration_min ?? (type === "food" ? 60 : 120),
    price_level: rest.price_level ?? (type === "food" ? "¥¥" : "¥"),
    description: rest.description ?? "",
    tips: rest.tips ?? "",
    best_time: rest.best_time ?? "09:00-17:00",
    rating: rest.rating ?? 4.5,
    lat: rest.lat,
    lng: rest.lng,
    name: rest.name,
  }));
}

function city(
  id: string,
  name: string,
  province: string,
  description: string,
  center_lat: number,
  center_lng: number,
  highlights: string[],
  attractions: PoiInput[],
  foods: PoiInput[],
  photoSpots: CitySeed["photoSpots"],
  itineraries: CitySeed["itineraries"],
): CitySeed {
  return {
    city: { id, name, province, description, center_lat, center_lng, highlights },
    pois: pois(id, [...attractions, ...foods]),
    photoSpots,
    itineraries,
  };
}

const F = { type: "food" as const };
const A = { type: "attraction" as const };

export const SHANTOU_SEED = city(
  "shantou", "汕头", "广东", "海滨侨乡，牛肉火锅、生腌与骑楼文化", 23.354, 116.682,
  ["牛肉火锅", "小公园", "南澳岛"],
  [
    { key: "xiaogongyuan", name: "小公园骑楼群", tags: ["骑楼", "夜景"], lat: 23.359, lng: 116.681, address: "金平区", open_hours: "全天", ticket: "免费", description: "百年骑楼，夜景极美。", tips: "傍晚到。", ...A },
    { key: "nanao", name: "南澳岛", tags: ["海岛"], lat: 23.422, lng: 117.025, address: "南澳县", open_hours: "全天", ticket: "过桥约¥96", description: "青澳湾、风车山。", avg_duration_min: 480, price_level: "¥¥", ...A },
  ],
  [
    { key: "xinghua", name: "杏花吴记牛肉火锅", tags: ["火锅", "必吃"], lat: 23.368, lng: 116.698, address: "杏花西路", description: "沙茶配鲜切牛肉。", rating: 4.7, ...F },
    { key: "changping", name: "长平肥姐白粥", tags: ["生腌", "夜宵"], lat: 23.361, lng: 116.705, address: "长平路", open_hours: "18:00-03:00", description: "生腌配白粥。", best_time: "21:00", ...F },
    { key: "douhua", name: "广场老牌豆花甜汤", tags: ["甜汤"], lat: 23.358, lng: 116.683, address: "小公园", description: "豆花甜汤。", price_level: "¥", ...F },
  ],
  [{ id: "spot_shantou_1", poi_id: "poi_shantou_xiaogongyuan", name: "纪念亭夜景", lat: 23.359, lng: 116.681, angle: "仰拍", best_light: "19:00", best_season: "全年", description: "经典机位。", tips: "" }],
  [
    { id: "trip_shantou_c", title: "汕头 2 日经典", days: 2, summary: "骑楼+南澳", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "10:00", poi_id: "poi_shantou_xiaogongyuan", note: "骑楼", duration_min: 120 },
      { day: 2, sort_order: 1, time_slot: "09:00", poi_id: "poi_shantou_nanao", note: "海岛", duration_min: 480 },
    ]},
    { id: "trip_shantou_food", title: "汕头美食攻略", days: 1, summary: "火锅、甜汤、生腌", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "10:30", poi_id: "poi_shantou_xinghua", note: "火锅", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "15:00", poi_id: "poi_shantou_douhua", note: "甜汤", duration_min: 30 },
      { day: 1, sort_order: 3, time_slot: "21:00", poi_id: "poi_shantou_changping", note: "生腌", duration_min: 60 },
    ]},
  ],
);

export const CHANGSHA_SEED = city(
  "changsha", "长沙", "湖南", "湘菜之都，臭豆腐与岳麓文化", 28.228, 112.938,
  ["臭豆腐", "岳麓山", "橘子洲"],
  [
    { key: "yuelu", name: "岳麓山", tags: ["山", "历史"], lat: 28.183, lng: 112.934, address: "岳麓区", open_hours: "06:00-22:00", ticket: "免费", description: "爱晚亭、岳麓书院。", ...A },
    { key: "juzizhou", name: "橘子洲", tags: ["湘江", "雕像"], lat: 28.196, lng: 112.961, address: "岳麓区", open_hours: "07:00-22:00", ticket: "免费", description: "毛泽东艺术雕塑。", avg_duration_min: 180, ...A },
    { key: "taiping", name: "太平老街", tags: ["古街"], lat: 28.198, lng: 112.972, address: "天心区", open_hours: "全天", ticket: "免费", description: "老长沙风情。", ...A },
  ],
  [
    { key: "choudoufu", name: "黑色经典臭豆腐", tags: ["臭豆腐", "必吃"], lat: 28.198, lng: 112.971, address: "太平街", description: "外酥里嫩。", ...F },
    { key: "wenheyou", name: "文和友老长沙龙虾馆", tags: ["口味虾"], lat: 28.194, lng: 112.98, address: "海信广场", description: "口味虾、湘菜。", price_level: "¥¥¥", ...F },
    { key: "chayan", name: "茶颜悦色", tags: ["奶茶"], lat: 28.197, lng: 112.975, address: "市区", description: "幽兰拿铁招牌。", price_level: "¥", avg_duration_min: 15, ...F },
  ],
  [{ id: "spot_cs_1", poi_id: "poi_changsha_juzizhou", name: "橘子洲雕塑", lat: 28.196, lng: 112.961, angle: "广角", best_light: "日落", best_season: "春秋", description: "湘江+雕塑。", tips: "" }],
  [
    { id: "trip_cs_c", title: "长沙 2 日经典", days: 2, summary: "岳麓+橘子洲", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "09:00", poi_id: "poi_changsha_yuelu", note: "", duration_min: 180 },
      { day: 2, sort_order: 1, time_slot: "16:00", poi_id: "poi_changsha_juzizhou", note: "日落", duration_min: 120 },
    ]},
    { id: "trip_cs_food", title: "长沙美食攻略", days: 1, summary: "湘味一日", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "12:00", poi_id: "poi_changsha_choudoufu", note: "", duration_min: 30 },
      { day: 1, sort_order: 2, time_slot: "18:00", poi_id: "poi_changsha_wenheyou", note: "口味虾", duration_min: 90 },
    ]},
  ],
);

export const GUANGZHOU_SEED = city(
  "guangzhou", "广州", "广东", "千年商都，早茶、骑楼与珠江夜景", 23.129, 113.264,
  ["早茶", "陈家祠", "珠江夜游"],
  [
    { key: "chenjiaci", name: "陈家祠", tags: ["岭南建筑"], lat: 23.127, lng: 113.245, address: "荔湾区", open_hours: "09:00-17:30", ticket: "约¥10", description: "岭南建筑瑰宝。", ...A },
    { key: "zhujiang", name: "珠江夜游", tags: ["夜景"], lat: 23.119, lng: 113.268, address: "天字码头", open_hours: "18:30-22:00", ticket: "约¥68起", description: "广州塔+珠江夜景。", best_time: "19:30", price_level: "¥¥", ...A },
    { key: "shamian", name: "沙面岛", tags: ["欧式", "适合拍照"], lat: 23.108, lng: 113.243, address: "荔湾区", open_hours: "全天", ticket: "免费", description: "欧式建筑群。", ...A },
  ],
  [
    { key: "dimsum", name: "点都德", tags: ["早茶", "必吃"], lat: 23.125, lng: 113.27, address: "多家分店", open_hours: "07:00-22:00", description: "虾饺、凤爪、肠粉。", best_time: "08:00-10:00", ...F },
    { key: "changfen", name: "银记肠粉", tags: ["肠粉", "小吃"], lat: 23.121, lng: 113.258, address: "上下九", description: "布拉肠粉老字号。", price_level: "¥", ...F },
    { key: "baozifan", name: "超记煲仔饭", tags: ["煲仔饭"], lat: 23.118, lng: 113.262, address: "越秀区", description: "腊味煲仔饭。", ...F },
  ],
  [{ id: "spot_gz_1", poi_id: "poi_guangzhou_shamian", name: "沙面欧式街", lat: 23.108, lng: 113.243, angle: "纵深", best_light: "下午", best_season: "全年", description: "复古街拍。", tips: "" }],
  [
    { id: "trip_gz_c", title: "广州 2 日经典", days: 2, summary: "西关文化+珠江", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "09:00", poi_id: "poi_guangzhou_chenjiaci", note: "", duration_min: 120 },
      { day: 1, sort_order: 2, time_slot: "19:30", poi_id: "poi_guangzhou_zhujiang", note: "夜游", duration_min: 90 },
    ]},
    { id: "trip_gz_food", title: "广州美食攻略", days: 1, summary: "早茶与西关味", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "08:30", poi_id: "poi_guangzhou_dimsum", note: "早茶", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "12:00", poi_id: "poi_guangzhou_changfen", note: "肠粉", duration_min: 30 },
      { day: 1, sort_order: 3, time_slot: "18:00", poi_id: "poi_guangzhou_baozifan", note: "煲仔饭", duration_min: 45 },
    ]},
  ],
);

export const HANGZHOU_SEED = city(
  "hangzhou", "杭州", "浙江", "西湖诗意，龙井茶与江南园林", 30.274, 120.155,
  ["西湖", "龙井茶", "灵隐寺"],
  [
    { key: "xihu", name: "西湖风景名胜区", tags: ["世界遗产"], lat: 30.242, lng: 120.148, address: "西湖区", open_hours: "全天", ticket: "免费", description: "断桥、苏堤、雷峰塔。", avg_duration_min: 240, ...A },
    { key: "lingyin", name: "灵隐寺", tags: ["佛教"], lat: 30.242, lng: 120.101, address: "西湖区", open_hours: "07:00-18:00", ticket: "约¥75", description: "千年古刹，飞来峰石刻。", ...A },
    { key: "hefang", name: "河坊街", tags: ["古街", "小吃"], lat: 30.239, lng: 120.17, address: "上城区", open_hours: "全天", ticket: "免费", description: "南宋御街风情。", ...A },
  ],
  [
    { key: "pianerchuan", name: "奎元馆", tags: ["片儿川", "老字号"], lat: 30.25, lng: 120.165, address: "解放路", description: "片儿川、杭帮面。", ...F },
    { key: "dongporou", name: "楼外楼", tags: ["杭帮菜", "西湖醋鱼"], lat: 30.251, lng: 120.14, address: "孤山路", description: "西湖醋鱼、东坡肉。", price_level: "¥¥¥", rating: 4.4, ...F },
    { key: "longjing", name: "龙井村茶室", tags: ["龙井", "体验"], lat: 30.22, lng: 120.108, address: "龙井村", description: "明前龙井品鉴。", ...F },
  ],
  [{ id: "spot_hz_1", poi_id: "poi_hangzhou_xihu", name: "断桥残雪", lat: 30.258, lng: 120.148, angle: "侧拍", best_light: "清晨", best_season: "冬", description: "西湖经典。", tips: "" }],
  [
    { id: "trip_hz_c", title: "杭州 2 日经典", days: 2, summary: "西湖+灵隐", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "08:00", poi_id: "poi_hangzhou_xihu", note: "环湖", duration_min: 240 },
      { day: 2, sort_order: 1, time_slot: "09:00", poi_id: "poi_hangzhou_lingyin", note: "", duration_min: 150 },
    ]},
    { id: "trip_hz_food", title: "杭州美食攻略", days: 1, summary: "杭帮菜与茶", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "12:00", poi_id: "poi_hangzhou_dongporou", note: "楼外楼", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "15:00", poi_id: "poi_hangzhou_longjing", note: "品茶", duration_min: 60 },
    ]},
  ],
);

export const XIAN_SEED = city(
  "xian", "西安", "陕西", "十三朝古都，兵马俑与回民街", 34.341, 108.94,
  ["兵马俑", "回民街", "城墙"],
  [
    { key: "bingmayong", name: "秦始皇兵马俑", tags: ["世界遗产"], lat: 34.385, lng: 109.278, address: "临潼区", open_hours: "08:30-17:00", ticket: "约¥120", description: "世界第八大奇迹。", avg_duration_min: 180, price_level: "¥¥", ...A },
    { key: "citywall", name: "西安城墙", tags: ["骑行", "夜景"], lat: 34.258, lng: 108.946, address: "南门", open_hours: "08:00-22:00", ticket: "约¥54", description: "中国现存最完整古城墙。", ...A },
    { key: "dayanta", name: "大雁塔", tags: ["唐代"], lat: 34.218, lng: 108.964, address: "雁塔区", open_hours: "08:00-18:00", ticket: "约¥40", description: "大唐不夜城旁。", ...A },
  ],
  [
    { key: "roujiamo", name: "老米家泡馍", tags: ["泡馍", "必吃"], lat: 34.262, lng: 108.937, address: "回民街", description: "羊肉泡馍。", ...F },
    { key: "liangpi", name: "魏家凉皮", tags: ["凉皮", "连锁"], lat: 34.265, lng: 108.94, address: "市区多家", description: "肉夹馍+凉皮。", price_level: "¥", ...F },
    { key: "rojmo", name: "樊记腊汁肉夹馍", tags: ["肉夹馍", "老字号"], lat: 34.261, lng: 108.935, address: "竹笆市", description: "腊汁肉夹馍鼻祖。", rating: 4.6, ...F },
  ],
  [{ id: "spot_xa_1", poi_id: "poi_xian_citywall", name: "城墙南门", lat: 34.255, lng: 108.946, angle: "航拍感广角", best_light: "日落", best_season: "全年", description: "城墙全景。", tips: "" }],
  [
    { id: "trip_xa_c", title: "西安 2 日经典", days: 2, summary: "兵马俑+城墙", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "08:00", poi_id: "poi_xian_bingmayong", note: "", duration_min: 180 },
      { day: 2, sort_order: 1, time_slot: "16:00", poi_id: "poi_xian_citywall", note: "骑行", duration_min: 120 },
    ]},
    { id: "trip_xa_food", title: "西安美食攻略", days: 1, summary: "回民街风味", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "12:00", poi_id: "poi_xian_rojmo", note: "肉夹馍", duration_min: 30 },
      { day: 1, sort_order: 2, time_slot: "13:00", poi_id: "poi_xian_roujiamo", note: "泡馍", duration_min: 60 },
    ]},
  ],
);

export const YANGZHOU_SEED = city(
  "yangzhou", "扬州", "江苏", "淮扬菜发源地，瘦西湖与早茶", 32.394, 119.412,
  ["瘦西湖", "淮扬菜", "早茶"],
  [
    { key: "shouxihu", name: "瘦西湖", tags: ["园林", "5A"], lat: 32.408, lng: 119.424, address: "邗江区", open_hours: "06:00-18:00", ticket: "约¥100", description: "烟花三月下扬州。", ...A },
    { key: "geyuan", name: "个园", tags: ["竹", "园林"], lat: 32.401, lng: 119.445, address: "广陵区", open_hours: "07:15-17:30", ticket: "约¥45", description: "四季假山。", ...A },
    { key: "dongguan", name: "东关街", tags: ["古街"], lat: 32.399, lng: 119.448, address: "广陵区", open_hours: "全天", ticket: "免费", description: "千年古街。", ...A },
  ],
  [
    { key: "zaocan", name: "趣园茶社", tags: ["早茶", "淮扬"], lat: 32.405, lng: 119.422, address: "瘦西湖旁", open_hours: "06:00-10:30", description: "蟹黄汤包、三丁包。", best_time: "07:00", rating: 4.7, ...F },
    { key: "shizitou", name: "扬州狮子楼", tags: ["淮扬菜", "狮子头"], lat: 32.398, lng: 119.44, address: "东关街", description: "清炖狮子头。", price_level: "¥¥¥", ...F },
    { key: "chaofan", name: "蒋家桥饺面店", tags: ["饺面", "平民"], lat: 32.396, lng: 119.438, address: "广陵区", description: "扬州炒饭、饺面。", price_level: "¥", ...F },
  ],
  [{ id: "spot_yz_1", poi_id: "poi_yangzhou_shouxihu", name: "五亭桥", lat: 32.41, lng: 119.42, angle: "湖面倒影", best_light: "清晨", best_season: "3-4月", description: "瘦西湖标志。", tips: "" }],
  [
    { id: "trip_yz_c", title: "扬州 1 日经典", days: 1, summary: "瘦西湖+东关街", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "07:00", poi_id: "poi_yangzhou_zaocan", note: "早茶", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "09:30", poi_id: "poi_yangzhou_shouxihu", note: "", duration_min: 180 },
    ]},
    { id: "trip_yz_food", title: "扬州美食攻略", days: 1, summary: "淮扬早茶之旅", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "07:00", poi_id: "poi_yangzhou_zaocan", note: "早茶", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "12:00", poi_id: "poi_yangzhou_shizitou", note: "狮子头", duration_min: 90 },
    ]},
  ],
);

export const SHANGHAI_SEED = city(
  "shanghai", "上海", "上海", "魔都风情，外滩、弄堂与小笼包", 31.23, 121.474,
  ["外滩", "小笼包", "迪士尼"],
  [
    { key: "waitan", name: "外滩", tags: ["夜景", "万国建筑"], lat: 31.24, lng: 121.49, address: "黄浦区", open_hours: "全天", ticket: "免费", description: "黄浦江+陆家嘴天际线。", best_time: "18:00-22:00", ...A },
    { key: "yuyuan", name: "豫园", tags: ["园林", "老城厢"], lat: 31.227, lng: 121.492, address: "黄浦区", open_hours: "08:30-16:30", ticket: "约¥40", description: "明代园林+城隍庙。", ...A },
    { key: "disney", name: "上海迪士尼", tags: ["主题乐园"], lat: 31.144, lng: 121.658, address: "浦东新区", open_hours: "09:00-21:00", ticket: "约¥475", description: "中国大陆首座迪士尼。", avg_duration_min: 480, price_level: "¥¥¥", ...A },
  ],
  [
    { key: "xiaolong", name: "南翔馒头店", tags: ["小笼包", "老字号"], lat: 31.227, lng: 121.491, address: "豫园", description: "蟹粉小笼。", ...F },
    { key: "shengjian", name: "大壶春生煎", tags: ["生煎", "必吃"], lat: 31.228, lng: 121.485, address: "四川中路", description: "底脆汁多。", rating: 4.6, ...F },
    { key: "benbang", name: "老吉士酒家", tags: ["本帮菜"], lat: 31.22, lng: 121.46, address: "天平路", description: "红烧肉、响油鳝丝。", price_level: "¥¥¥", ...F },
  ],
  [{ id: "spot_sh_1", poi_id: "poi_shanghai_waitan", name: "外滩观景台", lat: 31.24, lng: 121.49, angle: "陆家嘴同框", best_light: "蓝调", best_season: "全年", description: "魔都名片。", tips: "" }],
  [
    { id: "trip_sh_c", title: "上海 2 日经典", days: 2, summary: "外滩+豫园", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "09:00", poi_id: "poi_shanghai_yuyuan", note: "", duration_min: 120 },
      { day: 1, sort_order: 2, time_slot: "19:00", poi_id: "poi_shanghai_waitan", note: "夜景", duration_min: 90 },
    ]},
    { id: "trip_sh_food", title: "上海美食攻略", days: 1, summary: "小笼与生煎", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "08:00", poi_id: "poi_shanghai_shengjian", note: "生煎", duration_min: 30 },
      { day: 1, sort_order: 2, time_slot: "12:00", poi_id: "poi_shanghai_xiaolong", note: "小笼", duration_min: 45 },
    ]},
  ],
);

export const BEIJING_SEED = city(
  "beijing", "北京", "北京", "六朝古都，故宫、胡同与烤鸭", 39.904, 116.407,
  ["故宫", "烤鸭", "长城"],
  [
    { key: "gugong", name: "故宫博物院", tags: ["世界遗产"], lat: 39.916, lng: 116.397, address: "东城区", open_hours: "08:30-17:00", ticket: "约¥60", description: "紫禁城，明清皇宫。", avg_duration_min: 240, price_level: "¥¥", ...A },
    { key: "changcheng", name: "八达岭长城", tags: ["长城", "5A"], lat: 40.359, lng: 116.014, address: "延庆区", open_hours: "06:30-17:00", ticket: "约¥40", description: "不到长城非好汉。", avg_duration_min: 240, ...A },
    { key: "hutong", name: "南锣鼓巷", tags: ["胡同", "文艺"], lat: 39.937, lng: 116.403, address: "东城区", open_hours: "全天", ticket: "免费", description: "老北京胡同文化。", ...A },
  ],
  [
    { key: "kaoya", name: "四季民福烤鸭店", tags: ["烤鸭", "必吃"], lat: 39.914, lng: 116.4, address: "故宫东门", description: "酥皮烤鸭。", rating: 4.7, ...F },
    { key: "zhajiang", name: "海碗居", tags: ["炸酱面", "老北京"], lat: 39.938, lng: 116.39, address: "增光路", description: "老北京炸酱面。", ...F },
    { key: "shuanyang", name: "东来顺", tags: ["涮羊肉", "老字号"], lat: 39.92, lng: 116.41, address: "王府井", description: "铜锅涮肉。", price_level: "¥¥¥", ...F },
  ],
  [{ id: "spot_bj_1", poi_id: "poi_beijing_gugong", name: "角楼", lat: 39.918, lng: 116.392, angle: "护城河倒影", best_light: "日出", best_season: "冬", description: "故宫经典机位。", tips: "" }],
  [
    { id: "trip_bj_c", title: "北京 2 日经典", days: 2, summary: "故宫+长城", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "08:30", poi_id: "poi_beijing_gugong", note: "提前预约", duration_min: 240 },
      { day: 2, sort_order: 1, time_slot: "07:00", poi_id: "poi_beijing_changcheng", note: "", duration_min: 240 },
    ]},
    { id: "trip_bj_food", title: "北京美食攻略", days: 1, summary: "京味一日", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "11:30", poi_id: "poi_beijing_kaoya", note: "烤鸭", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "18:00", poi_id: "poi_beijing_shuanyang", note: "涮肉", duration_min: 90 },
    ]},
  ],
);

export const LUOYANG_SEED = city(
  "luoyang", "洛阳", "河南", "十三朝古都，龙门石窟与牡丹", 34.62, 112.454,
  ["龙门石窟", "水席", "白马寺"],
  [
    { key: "longmen", name: "龙门石窟", tags: ["世界遗产"], lat: 34.559, lng: 112.468, address: "洛龙区", open_hours: "08:00-18:00", ticket: "约¥90", description: "石刻艺术宝库。", avg_duration_min: 180, ...A },
    { key: "baima", name: "白马寺", tags: ["佛教", "第一古刹"], lat: 34.722, lng: 112.605, address: "洛龙区", open_hours: "07:30-18:00", ticket: "约¥35", description: "中国第一古刹。", ...A },
    { key: "laojun", name: "老君山", tags: ["山景", "金顶"], lat: 33.736, lng: 111.655, address: "栾川县", open_hours: "08:00-17:00", ticket: "约¥100", description: "道教名山，云海金顶。", avg_duration_min: 360, price_level: "¥¥", ...A },
  ],
  [
    { key: "shuixi", name: "真不同饭店", tags: ["水席", "必吃"], lat: 34.682, lng: 112.47, address: "老城", description: "洛阳水席二十四道。", price_level: "¥¥¥", rating: 4.5, ...F },
    { key: "niurou", name: "南关小碗牛肉汤", tags: ["牛肉汤", "早餐"], lat: 34.675, lng: 112.465, address: "南关", open_hours: "05:00-14:00", description: "洛阳早餐灵魂。", price_level: "¥", best_time: "07:00", ...F },
    { key: "bufan", name: "不翻汤", tags: ["小吃", "传统"], lat: 34.68, lng: 112.468, address: "丽景门", description: "洛阳传统小吃。", price_level: "¥", ...F },
  ],
  [{ id: "spot_ly_1", poi_id: "poi_luoyang_longmen", name: "卢舍那大佛", lat: 34.559, lng: 112.468, angle: "仰拍", best_light: "侧光下午", best_season: "全年", description: "石窟标志。", tips: "" }],
  [
    { id: "trip_ly_c", title: "洛阳 2 日经典", days: 2, summary: "龙门+白马寺", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "09:00", poi_id: "poi_luoyang_longmen", note: "", duration_min: 180 },
      { day: 2, sort_order: 1, time_slot: "09:00", poi_id: "poi_luoyang_baima", note: "", duration_min: 120 },
    ]},
    { id: "trip_ly_food", title: "洛阳美食攻略", days: 1, summary: "水席与汤文化", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "07:00", poi_id: "poi_luoyang_niurou", note: "牛肉汤", duration_min: 30 },
      { day: 1, sort_order: 2, time_slot: "12:00", poi_id: "poi_luoyang_shuixi", note: "水席", duration_min: 120 },
    ]},
  ],
);

export const WUHAN_SEED = city(
  "wuhan", "武汉", "湖北", "江城武汉，热干面与黄鹤楼", 30.593, 114.305,
  ["热干面", "黄鹤楼", "东湖"],
  [
    { key: "huanghelou", name: "黄鹤楼", tags: ["江南名楼"], lat: 30.544, lng: 114.302, address: "武昌区", open_hours: "08:00-18:00", ticket: "约¥70", description: "天下江山第一楼。", ...A },
    { key: "donghu", name: "东湖绿道", tags: ["骑行", "樱花"], lat: 30.558, lng: 114.375, address: "武昌区", open_hours: "全天", ticket: "免费", description: "中国最大城中湖。", avg_duration_min: 180, ...A },
    { key: "hubuxiang", name: "户部巷", tags: ["小吃街"], lat: 30.548, lng: 114.298, address: "武昌区", open_hours: "全天", ticket: "免费", description: "汉味小吃第一巷。", ...A },
  ],
  [
    { key: "regan", name: "蔡林记热干面", tags: ["热干面", "必吃"], lat: 30.548, lng: 114.299, address: "户部巷", description: "武汉早餐名片。", price_level: "¥", avg_duration_min: 20, ...F },
    { key: "yabo", name: "周黑鸭", tags: ["鸭脖", "伴手礼"], lat: 30.55, lng: 114.3, address: "市区多家", description: "甜辣鸭脖。", ...F },
    { key: "doupi", name: "老通城豆皮", tags: ["豆皮", "老字号"], lat: 30.547, lng: 114.297, address: "中山大道", description: "三鲜豆皮。", ...F },
  ],
  [{ id: "spot_wh_1", poi_id: "poi_wuhan_huanghelou", name: "黄鹤楼飞檐", lat: 30.544, lng: 114.302, angle: "仰拍", best_light: "下午", best_season: "全年", description: "名楼标志。", tips: "" }],
  [
    { id: "trip_wh_c", title: "武汉 1 日经典", days: 1, summary: "黄鹤楼+东湖", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "09:00", poi_id: "poi_wuhan_huanghelou", note: "", duration_min: 120 },
      { day: 1, sort_order: 2, time_slot: "14:00", poi_id: "poi_wuhan_donghu", note: "骑行", duration_min: 180 },
    ]},
    { id: "trip_wh_food", title: "武汉美食攻略", days: 1, summary: "过早文化", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "07:30", poi_id: "poi_wuhan_regan", note: "热干面", duration_min: 20 },
      { day: 1, sort_order: 2, time_slot: "12:00", poi_id: "poi_wuhan_doupi", note: "豆皮", duration_min: 30 },
    ]},
  ],
);

export const CHENGDU_SEED = city(
  "chengdu", "成都", "四川", "天府之国，火锅、熊猫与慢生活", 30.572, 104.066,
  ["火锅", "大熊猫", "宽窄巷子"],
  [
    { key: "panda", name: "成都大熊猫繁育研究基地", tags: ["熊猫", "亲子"], lat: 30.732, lng: 104.148, address: "成华区", open_hours: "07:30-18:00", ticket: "约¥55", description: "看国宝吃竹。", tips: "早上去最活跃。", best_time: "08:00-10:00", ...A },
    { key: "kuanzhai", name: "宽窄巷子", tags: ["古街", "文艺"], lat: 30.663, lng: 104.053, address: "青羊区", open_hours: "全天", ticket: "免费", description: "川西民居风格。", ...A },
    { key: "jinli", name: "锦里古街", tags: ["古街", "夜景"], lat: 30.646, lng: 104.049, address: "武侯区", open_hours: "全天", ticket: "免费", description: "三国文化+小吃。", ...A },
  ],
  [
    { key: "huoguo", name: "蜀大侠火锅", tags: ["火锅", "必吃"], lat: 30.66, lng: 104.06, address: "多家分店", description: "牛油锅底，麻辣鲜香。", ...F },
    { key: "chuanchuan", name: "钢管厂五区小郡肝", tags: ["串串", "网红"], lat: 30.658, lng: 104.055, address: "市区", description: "小郡肝串串。", ...F },
    { key: "dandan", name: "陈麻婆豆腐", tags: ["川菜", "老字号"], lat: 30.655, lng: 104.05, address: "西玉龙街", description: "麻婆豆腐发源地。", rating: 4.6, ...F },
  ],
  [{ id: "spot_cd_1", poi_id: "poi_chengdu_kuanzhai", name: "宽窄巷子门头", lat: 30.663, lng: 104.053, angle: "人文街拍", best_light: "下午", best_season: "全年", description: "川西风情。", tips: "" }],
  [
    { id: "trip_cd_c", title: "成都 2 日经典", days: 2, summary: "熊猫+宽窄巷子", tags: ["经典"], items: [
      { day: 1, sort_order: 1, time_slot: "08:00", poi_id: "poi_chengdu_panda", note: "早看熊猫", duration_min: 180 },
      { day: 2, sort_order: 1, time_slot: "14:00", poi_id: "poi_chengdu_kuanzhai", note: "", duration_min: 120 },
    ]},
    { id: "trip_cd_food", title: "成都美食攻略", days: 1, summary: "火锅与川菜", tags: ["美食", "攻略"], items: [
      { day: 1, sort_order: 1, time_slot: "12:00", poi_id: "poi_chengdu_huoguo", note: "火锅", duration_min: 90 },
      { day: 1, sort_order: 2, time_slot: "19:00", poi_id: "poi_chengdu_chuanchuan", note: "串串", duration_min: 60 },
    ]},
  ],
);

export const ALL_CITY_SEEDS: CitySeed[] = [
  SHANTOU_SEED,
  CHANGSHA_SEED,
  GUANGZHOU_SEED,
  HANGZHOU_SEED,
  XIAN_SEED,
  YANGZHOU_SEED,
  SHANGHAI_SEED,
  BEIJING_SEED,
  LUOYANG_SEED,
  WUHAN_SEED,
  CHENGDU_SEED,
];
