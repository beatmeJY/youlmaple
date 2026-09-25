# 메이플 노트

개인용 메이플스토리 정보와 메모를 저장하는 웹앱입니다.  
데이터는 Supabase에 저장되고, 로그인한 본인만 자기 데이터를 볼 수 있습니다.

## 구성

- 화면: HTML, CSS, JavaScript
- 로그인과 데이터베이스: Supabase
- 주소로 공개: GitHub Pages
- 별도의 유료 서버는 사용하지 않습니다.

## 폴더

```text
index.html              화면의 시작 파일
css/styles.css          공통 디자인
js/main.js              앱 시작
js/routes.js            왼쪽 메뉴 목록
js/router.js            메뉴 이동
js/ui.js                레이아웃, 다크 모드
js/auth.js              로그인 (STEP 3)
js/supabase-client.js   DB 연결 (STEP 3)
js/config.example.js    설정 예시
js/config.js            내 설정. GitHub에 올리지 않음
js/pages/               메뉴별 화면
sql/001_schema.sql      테이블 생성
sql/002_rls.sql         사용자별 접근 권한
sql/003_check.sql       권한이 켜졌는지 확인
sql/004_accounts_and_monsters.sql  계정과 몬스터로 바꾸는 추가 작업
.github/workflows/pages.yml  GitHub Pages 배포
```

## 데이터베이스 만들기

Supabase SQL Editor에서 아래 순서대로 파일 전체를 붙여 넣고 Run 합니다.

1. `sql/001_schema.sql`
2. `sql/002_rls.sql`
3. `sql/003_check.sql` 로 결과 확인

이미 001과 002를 실행했다면, 그 파일을 다시 실행하지 말고 `sql/004_accounts_and_monsters.sql` 만 실행합니다.

004까지 이미 실행했다면 `sql/005_glance_columns.sql` 만 실행합니다. 퀘스트 필요 재료와 몬스터의 1경험치당 HP 칸을 추가합니다.

`anon` 행이 없고, 표마다 `rls_enabled` 가 true 이면 정상입니다.

## 로그인 연결

1. `js/config.example.js` 를 복사해 `js/config.js` 를 만듭니다.
2. Supabase **Project Settings → API Keys** 에서 Project URL 과 Publishable key 만 붙여 넣습니다.
3. Secret key, service_role key 는 넣지 않습니다.
4. Authentication 에서 Email 로그인을 켜 둡니다. 개인용이면 Confirm email 을 끄면 가입 직후 바로 로그인됩니다.
5. Authentication → URL Configuration 의 Site URL 을 `http://127.0.0.1:5500` 으로 맞춥니다.

## 키 구분

| 값 | 브라우저에 있어도 되나 | 저장소에 커밋하나 |
| --- | --- | --- |
| Project URL | 예 | 아니오. `js/config.js` 또는 GitHub Secret |
| Publishable key (`sb_publishable_...`, 예전 anon key) | 예. RLS가 켜져 있어야 함 | 아니오 |
| Secret key, service_role key | 절대 아니오 | 절대 아니오 |

공개용 키를 숨기는 것만으로는 데이터가 보호되지 않습니다.  
테이블마다 RLS를 켜고, `user_id`가 로그인한 사용자와 같을 때만 조회/수정/삭제가 되게 합니다.

## 로컬에서 화면 보기

`index.html`을 더블클릭하면 메뉴 스크립트가 막힐 수 있습니다. 아래처럼 주소로 엽니다.

```powershell
py -3 -m http.server 5500
```

`py` 가 없으면 `python -m http.server 5500` 을 사용합니다.  
브라우저에서 http://127.0.0.1:5500 을 엽니다. 터미널에 `Serving HTTP` 가 보이는 동안만 사이트가 열립니다.

## 인터넷 주소로 열기

GitHub 저장소는 공개이고, 데이터는 Supabase에 남습니다.  
`js/config.js` 는 저장소에 올리지 않습니다. 배포할 때 GitHub Secret 두 개로 만듭니다.

- `SUPABASE_URL`: `https://....supabase.co`
- `SUPABASE_PUBLISHABLE_KEY`: Publishable key

Secret key 는 Secret 에도 넣지 않습니다.

배포가 끝나면 주소는 `https://사용자이름.github.io/youlmaple/` 입니다.  
Supabase **Authentication → URL Configuration** 의 Site URL 을 그 주소로 바꿉니다.  
Redirect URLs 에는 그 주소와 `http://127.0.0.1:5500` 을 함께 넣습니다.
