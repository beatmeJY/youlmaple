// 메뉴를 추가할 때는 이 목록에 한 줄 넣고, js/pages/ 에 화면 파일을 추가합니다.
export const routes = [
  { id: "dashboard", label: "대시보드", description: "최근 등록한 정보 요약" },
  { id: "characters", label: "캐릭터", description: "캐릭터 등록, 수정, 삭제" },
  { id: "monsters", label: "몬스터", description: "몬스터 레벨, 드랍, 명중률" },
  { id: "items", label: "아이템/시세", description: "아이템 가격 메모" },
  { id: "quests", label: "퀘스트", description: "퀘스트와 캐릭터별 완료 여부" },
  { id: "notes", label: "메모", description: "자유 메모" },
];
