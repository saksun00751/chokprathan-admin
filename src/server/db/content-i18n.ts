/**
 * Translations of the content a fresh install ships with (home banners and promotions), keyed by
 * the Thai title so migration 2 can backfill rows that were installed before content was
 * translatable. Staff edit these per language in the back office afterwards.
 */
export type BannerText = { tag: string; title: string; subtitle: string; ctaLabel: string };
export type PromoText = { title: string; summary: string; details: string };
type Others<T> = { en: T; lo: T; my: T; km: T };

export const BANNER_I18N: Record<string, Others<BannerText>> = {
  "ฝากแรกรับโบนัส [20%]": {
    en: { tag: "New members", title: "First deposit bonus [20%]", subtitle: "Deposit from 300 baht and get up to 500 baht extra", ctaLabel: "Sign up for the bonus" },
    lo: { tag: "ສະມາຊິກໃໝ່", title: "ຝາກຄັ້ງທຳອິດຮັບໂບນັດ [20%]", subtitle: "ຝາກຕັ້ງແຕ່ 300 ບາດ ຮັບເພີ່ມສູງສຸດ 500 ບາດ", ctaLabel: "ສະໝັກຮັບໂບນັດ" },
    my: { tag: "အသင်းဝင်သစ်", title: "ပထမဆုံး ငွေသွင်း ဘောနပ် [20%]", subtitle: "300 ဘတ်မှစ၍ သွင်းပါ အများဆုံး 500 ဘတ် ထပ်ရပါမည်", ctaLabel: "ဘောနပ်ရယူရန် စာရင်းသွင်းပါ" },
    km: { tag: "សមាជិកថ្មី", title: "ដាក់ប្រាក់លើកដំបូងទទួលបន្ថែម [20%]", subtitle: "ដាក់ចាប់ពី 300 បាត ទទួលបន្ថែមរហូតដល់ 500 បាត", ctaLabel: "ចុះឈ្មោះទទួលប្រាក់បន្ថែម" },
  },
  "คืนยอดเสีย [5%]": {
    en: { tag: "Every bill", title: "Cashback [5%]", subtitle: "Every number that misses pays some back the moment results are out", ctaLabel: "See my cashback" },
    lo: { tag: "ທຸກບິນ", title: "ຄືນຍອດເສຍ [5%]", subtitle: "ເລກໃດບໍ່ຖືກ ໄດ້ເງິນຄືນເຂົ້າກະເປົາທັນທີທີ່ອອກຜົນ", ctaLabel: "ເບິ່ງຍອດເງິນຄືນ" },
    my: { tag: "ထိုးစာရင်းတိုင်း", title: "ရှုံးငွေ ပြန်အမ်း [5%]", subtitle: "မပေါက်သော နံပါတ်တိုင်းအတွက် ရလဒ်ထွက်သည်နှင့် ငွေပြန်ရပါမည်", ctaLabel: "ပြန်အမ်းငွေ ကြည့်ရန်" },
    km: { tag: "គ្រប់សន្លឹក", title: "ប្រាក់ត្រឡប់ពីការចាញ់ [5%]", subtitle: "លេខណាមិនត្រូវ ទទួលប្រាក់ត្រឡប់ចូលកាបូបភ្លាមពេលចេញលទ្ធផល", ctaLabel: "មើលប្រាក់ត្រឡប់" },
  },
  "รับ [0.8%] ทุกยอดแทงของเพื่อน": {
    en: { tag: "Invite friends", title: "Earn [0.8%] of every friend's bets", subtitle: "Share your link and earn on two levels, paid straight to your wallet", ctaLabel: "Get my invite link" },
    lo: { tag: "ຊວນໝູ່", title: "ຮັບ [0.8%] ທຸກຍອດແທງຂອງໝູ່", subtitle: "ແບ່ງປັນລິ້ງຂອງທ່ານ ຮັບລາຍໄດ້ 2 ຊັ້ນ ໂອນເຂົ້າກະເປົາໄດ້ທັນທີ", ctaLabel: "ຮັບລິ້ງຊວນໝູ່" },
    my: { tag: "သူငယ်ချင်းဖိတ်", title: "သူငယ်ချင်း ထိုးကြေးတိုင်း၏ [0.8%] ရယူပါ", subtitle: "သင့်လင့်ခ်ကို မျှဝေပြီး အဆင့် 2 ဆင့် ဝင်ငွေရယူ ပိုက်ဆံအိတ်ထဲ ချက်ချင်းလွှဲနိုင်", ctaLabel: "ဖိတ်ကြားလင့်ခ် ရယူရန်" },
    km: { tag: "អញ្ជើញមិត្ត", title: "ទទួល [0.8%] ពីការចាក់របស់មិត្តរាល់ដង", subtitle: "ចែករំលែកតំណរបស់អ្នក ទទួលចំណូល 2 ជាន់ ផ្ទេរចូលកាបូបបានភ្លាម", ctaLabel: "យកតំណអញ្ជើញ" },
  },
  "ออกผล [88 รอบ] ทุกวัน": {
    en: { tag: "Yiki", title: "[88 draws] every day", subtitle: "Every 15 minutes from 06:00, day and night", ctaLabel: "Play Yiki" },
    lo: { tag: "ຢີ່ກີ", title: "ອອກຜົນ [88 ຮອບ] ທຸກມື້", subtitle: "ທຸກ 15 ນາທີ ຕັ້ງແຕ່ 06:00 ໂມງ ແທງໄດ້ທັງເວັນທັງຄືນ", ctaLabel: "ແທງຢີ່ກີ" },
    my: { tag: "ယီကီ", title: "နေ့စဉ် [88 ကြိမ်] ထီဖွင့်", subtitle: "မနက် 06:00 မှစ၍ 15 မိနစ်တိုင်း နေ့ရောညပါ ထိုးနိုင်", ctaLabel: "ယီကီ ထိုးရန်" },
    km: { tag: "យីគី", title: "ចេញលទ្ធផល [88 ជុំ] ជារៀងរាល់ថ្ងៃ", subtitle: "រៀងរាល់ 15 នាទី ចាប់ពីម៉ោង 06:00 ចាក់បានទាំងថ្ងៃទាំងយប់", ctaLabel: "ចាក់យីគី" },
  },
  "ฝากเข้า [ไว] ถอนเข้าบัญชีที่สมัคร": {
    en: { tag: "Deposit and withdraw", title: "[Fast] deposits, withdrawals to your own account", subtitle: "Every transaction is on record in your wallet", ctaLabel: "Deposit" },
    lo: { tag: "ຝາກ-ຖອນ", title: "ຝາກເຂົ້າ [ໄວ] ຖອນເຂົ້າບັນຊີທີ່ສະໝັກ", subtitle: "ທຸກລາຍການກວດສອບຍ້ອນຫຼັງໄດ້ໃນກະເປົາເງິນ", ctaLabel: "ຝາກເງິນ" },
    my: { tag: "ငွေသွင်း-ထုတ်", title: "[မြန်ဆန်] စွာ ငွေသွင်း၊ စာရင်းသွင်းထားသော အကောင့်သို့ ငွေထုတ်", subtitle: "ငွေလွှဲမှုတိုင်းကို ပိုက်ဆံအိတ်တွင် ပြန်စစ်နိုင်ပါသည်", ctaLabel: "ငွေသွင်းရန်" },
    km: { tag: "ដាក់-ដក", title: "ដាក់ប្រាក់ [រហ័ស] ដកចូលគណនីដែលបានចុះឈ្មោះ", subtitle: "គ្រប់ប្រតិបត្តិការពិនិត្យឡើងវិញបាននៅក្នុងកាបូប", ctaLabel: "ដាក់ប្រាក់" },
  },
};

export const PROMO_I18N: Record<string, Others<PromoText>> = {
  "โบนัสฝากแรก 20%": {
    en: { title: "20% first deposit bonus", summary: "Deposit 300 baht or more for the first time and get 20% extra, up to 500 baht", details: "Bet 3 times your deposit plus bonus before withdrawing. Once per account." },
    lo: { title: "ໂບນັດຝາກຄັ້ງທຳອິດ 20%", summary: "ຝາກຄັ້ງທຳອິດຕັ້ງແຕ່ 300 ບາດ ຮັບໂບນັດເພີ່ມ 20% ສູງສຸດ 500 ບາດ", details: "ທຳຍອດແທງໃຫ້ຄົບ 3 ເທົ່າຂອງຍອດຝາກລວມໂບນັດກ່ອນຖອນ ຮັບໄດ້ຄັ້ງດຽວຕໍ່ບັນຊີ" },
    my: { title: "ပထမဆုံး ငွေသွင်း ဘောနပ် 20%", summary: "ပထမဆုံးအကြိမ် 300 ဘတ်နှင့်အထက် သွင်းပါက 20% အပို အများဆုံး 500 ဘတ် ရပါမည်", details: "ငွေမထုတ်မီ သွင်းငွေနှင့် ဘောနပ်ပေါင်း၏ 3 ဆ ထိုးရပါမည်။ အကောင့်တစ်ခုလျှင် တစ်ကြိမ်သာ။" },
    km: { title: "ប្រាក់បន្ថែមដាក់លើកដំបូង 20%", summary: "ដាក់លើកដំបូងចាប់ពី 300 បាត ទទួលបន្ថែម 20% រហូតដល់ 500 បាត", details: "ចាក់ឱ្យគ្រប់ 3 ដងនៃប្រាក់ដាក់រួមប្រាក់បន្ថែម មុនពេលដក។ ទទួលបានតែម្តងក្នុងមួយគណនី។" },
  },
  "ฝากเพิ่มรับ 5% ทุกครั้ง": {
    en: { title: "5% on every deposit", summary: "Deposit 100 baht or more and get 5% extra, up to 200 baht each time", details: "Bet 2 times your deposit plus bonus before withdrawing." },
    lo: { title: "ຝາກເພີ່ມຮັບ 5% ທຸກຄັ້ງ", summary: "ຝາກຕັ້ງແຕ່ 100 ບາດ ຮັບເພີ່ມ 5% ສູງສຸດ 200 ບາດຕໍ່ຄັ້ງ", details: "ທຳຍອດແທງໃຫ້ຄົບ 2 ເທົ່າຂອງຍອດຝາກລວມໂບນັດກ່ອນຖອນ" },
    my: { title: "ငွေသွင်းတိုင်း 5% အပို", summary: "100 ဘတ်နှင့်အထက် သွင်းပါက 5% အပို တစ်ကြိမ်လျှင် အများဆုံး 200 ဘတ်", details: "ငွေမထုတ်မီ သွင်းငွေနှင့် ဘောနပ်ပေါင်း၏ 2 ဆ ထိုးရပါမည်။" },
    km: { title: "ដាក់បន្ថែមទទួល 5% គ្រប់ដង", summary: "ដាក់ចាប់ពី 100 បាត ទទួលបន្ថែម 5% រហូតដល់ 200 បាតក្នុងមួយដង", details: "ចាក់ឱ្យគ្រប់ 2 ដងនៃប្រាក់ដាក់រួមប្រាក់បន្ថែម មុនពេលដក។" },
  },
  "คืนยอดเสีย 5% ทุกบิล": {
    en: { title: "5% cashback on every bill", summary: "Numbers that miss pay 5% back into your cashback wallet as soon as results are out", details: "Move it to your main wallet any time. No turnover required." },
    lo: { title: "ຄືນຍອດເສຍ 5% ທຸກບິນ", summary: "ເລກທີ່ບໍ່ຖືກລາງວັນ ຮັບເງິນຄືນ 5% ເຂົ້າກະເປົາຄືນຍອດເສຍທັນທີທີ່ອອກຜົນ", details: "ກົດຮັບເຂົ້າກະເປົາຫຼັກໄດ້ຕະຫຼອດເວລາ ບໍ່ມີຍອດເທີນ" },
    my: { title: "ထိုးစာရင်းတိုင်း ရှုံးငွေ 5% ပြန်အမ်း", summary: "မပေါက်သော နံပါတ်များအတွက် ရလဒ်ထွက်သည်နှင့် 5% ကို ပြန်အမ်းငွေ ပိုက်ဆံအိတ်ထဲ ထည့်ပေးပါမည်", details: "ပင်မ ပိုက်ဆံအိတ်သို့ အချိန်မရွေး ရွှေ့နိုင်ပါသည်။ ထိုးကြေးလိုအပ်ချက် မရှိပါ။" },
    km: { title: "ប្រាក់ត្រឡប់ 5% គ្រប់សន្លឹក", summary: "លេខដែលមិនត្រូវ ទទួលប្រាក់ត្រឡប់ 5% ចូលកាបូបប្រាក់ត្រឡប់ភ្លាមពេលចេញលទ្ធផល", details: "ផ្ទេរចូលកាបូបមេបានគ្រប់ពេល។ គ្មានលក្ខខណ្ឌចាក់។" },
  },
  "ชวนเพื่อนรับค่าแนะนำ 2 ชั้น": {
    en: { title: "Two-level referral commission", summary: "Earn 0.8% of the bets of friends you invite, and 0.2% from their friends", details: "Commission reaches your referral wallet every time a friend's bill is settled, and moves to your main wallet at once." },
    lo: { title: "ຊວນໝູ່ຮັບຄ່າແນະນຳ 2 ຊັ້ນ", summary: "ຮັບ 0.8% ຈາກຍອດແທງຂອງໝູ່ທີ່ທ່ານຊວນ ແລະ 0.2% ຈາກໝູ່ຂອງໝູ່", details: "ຄ່າແນະນຳເຂົ້າກະເປົາແນະນຳໝູ່ທຸກຄັ້ງທີ່ບິນຂອງໝູ່ອອກຜົນ ໂອນເຂົ້າກະເປົາຫຼັກໄດ້ທັນທີ" },
    my: { title: "အဆင့် 2 ဆင့် မိတ်ဆက်ကော်မရှင်", summary: "သင်ဖိတ်သော သူငယ်ချင်းများ၏ ထိုးကြေး 0.8% နှင့် ၎င်းတို့၏ သူငယ်ချင်းများမှ 0.2% ရယူပါ", details: "သူငယ်ချင်း၏ ထိုးစာရင်း ရလဒ်ထွက်တိုင်း ကော်မရှင်သည် မိတ်ဆက် ပိုက်ဆံအိတ်ထဲ ရောက်ပြီး ပင်မ ပိုက်ဆံအိတ်သို့ ချက်ချင်းရွှေ့နိုင်ပါသည်။" },
    km: { title: "អញ្ជើញមិត្តទទួលកម្រៃ 2 ជាន់", summary: "ទទួល 0.8% ពីការចាក់របស់មិត្តដែលអ្នកអញ្ជើញ និង 0.2% ពីមិត្តរបស់មិត្ត", details: "កម្រៃចូលកាបូបណែនាំមិត្តរាល់ពេលសន្លឹករបស់មិត្តចេញលទ្ធផល ហើយផ្ទេរចូលកាបូបមេបានភ្លាម។" },
  },
};
