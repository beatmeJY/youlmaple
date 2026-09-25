-- 이미 사용 중인 데이터베이스용입니다.
-- Supabase SQL Editor에 이 파일 전체를 붙여 넣고 Run 합니다.
-- 사냥 이름 칸을 추가하고, 메모에 넣어 둔 사냥 이름을 그 칸으로 옮깁니다.
-- 001부터 010은 다시 실행하지 않습니다.

alter table public.hunts add column if not exists title text;

comment on column public.hunts.title is '사냥 이름. 맵이나 자리처럼 기록을 구분하는 제목';
comment on column public.hunts.memo is '사냥 메모. 누구에게 얼마를 받았는지처럼 제목과 따로 적는 내용';

-- 첫 줄은 사냥 이름입니다. 그 다음 줄만 메모로 남기고, 시간당 환산 안내는 지웁니다.
update public.hunts
set
  title = nullif(btrim(split_part(memo, E'\n', 1)), ''),
  memo = nullif(
    btrim(
      regexp_replace(
        case
          when strpos(memo, E'\n') = 0 then ''
          else substr(memo, strpos(memo, E'\n') + 1)
        end,
        '(^|\n)[^\n]*으로 맞춤[[:space:]]*',
        '',
        'g'
      )
    ),
    ''
  )
where memo is not null
  and (title is null or btrim(title) = '');
