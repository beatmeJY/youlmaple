export function translateDbError(error) {
  const raw = error?.message || "";
  if (/failed to fetch|network/i.test(raw)) {
    return "서버에 연결하지 못했습니다. 인터넷 연결을 확인해 주세요.";
  }
  if (/row-level security|permission denied|42501/i.test(raw)) {
    return "이 데이터를 다룰 권한이 없습니다. 다시 로그인한 뒤 시도해 주세요.";
  }
  if (/JWT|invalid claim|not authenticated/i.test(raw)) {
    return "로그인이 만료되었습니다. 다시 로그인해 주세요.";
  }
  if (/characters_level_check/i.test(raw)) return "레벨은 1 이상이어야 합니다.";
  if (/characters_combat_power_check|characters_current_exp_check|characters_meso_check/i.test(raw)) {
    return "스공, 경험치, 메소는 0 이상이어야 합니다.";
  }
  if (/quests_start_level_check/i.test(raw)) return "시작 레벨은 1 이상이어야 합니다.";
  if (/quests_exp_reward_check|quests_meso_reward_check/i.test(raw)) {
    return "경험치와 메소 보상은 0 이상이어야 합니다.";
  }
  if (/items_price_check/i.test(raw)) return "가격은 0 이상이어야 합니다.";
  if (/account_character_limit/i.test(raw)) return "한 계정에는 캐릭터를 6개까지 만들 수 있습니다.";
  if (/account_not_owned/i.test(raw)) return "내 계정이 아닌 곳에는 캐릭터를 넣을 수 없습니다.";
  if (/characters_account_id_fkey/i.test(raw)) {
    return "이 계정에 캐릭터가 있어서 삭제할 수 없습니다. 캐릭터를 먼저 삭제해 주세요.";
  }
  if (/monsters_level_check/i.test(raw)) return "몬스터 레벨은 1 이상이어야 합니다.";
  if (/monsters_.*_check/i.test(raw)) return "명중률, 체력, 경험치는 0 이상이어야 합니다.";
  if (/could not find the table|schema cache|does not exist/i.test(raw)) {
    return "표를 찾지 못했습니다. Supabase SQL Editor에서 sql/004_accounts_and_monsters.sql 을 실행해 주세요.";
  }
  return "저장하지 못했습니다. 입력 내용을 확인한 뒤 다시 시도해 주세요.";
}
