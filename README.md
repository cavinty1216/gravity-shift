# 🌀 Gravity Shift — 중력 반전 러너

GitHub Game Off 2026 ([itch.io/jam/game-off-2026](https://itch.io/jam/game-off-2026))의
**SHIFT** 테마로 만든 미니 게임이에요. 화면을 탭할 때마다 중력이 뒤집혀서
바닥과 천장을 오가며 장애물을 피하는 게임입니다.

---

## 🎮 하는 방법

| 상황 | 동작 |
|---|---|
| 📱 아이폰 | 화면을 **탭** |
| ⌨️ 데스크톱 | **스페이스** / **Shift** / **위 방향키** |
| 별 🌟 | 먹으면 **+5점** |
| 화면을 벗어나면 | 자동으로 **일시정지** |

장애물(빨간 가시·공중 바)에 닿으면 게임 오버. 바닥과 천장에 붙어
미끄러지는 건 안전해요.

## ▶️ 실행하는 법

**가장 쉬운 방법** — `gravity-shift-standalone.html` 파일을 더블클릭하면
브라우저에서 바로 실행돼요. (서버도 설치도 필요 없어요. 이 파일 하나만 있으면
어디서든 돌아가요.)

코드를 고칠 때는 **여러 파일로 된 원래 버전**을 쓰세요.

- `index.html`을 더블클릭해도 대부분의 브라우저에서 그냥 열려요.
- 브라우저가 파일을 막으면, 이 폴더에서:

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 열기
```

## 📁 파일 구조 (이 ZIP에 들어 있는 것)

```
gravity-shift/
├── index.html                      ← 게임 페이지 (html만)
├── css/style.css                   ← 화면 UI 스타일 (색은 CSS 변수 = 디자인 토큰)
├── js/game.js                      ← 게임 전체 로직 (한 파일, 한글 주석)
│     · CFG     : 난이도 숫자들 — 여기만 고치면 밸런스 조절 가능
│     · COLORS  : 게임 그림 색
│     · 스폰 → 업데이트 → 충돌 → 그리기 순서로 정리됨
├── gravity-shift-standalone.html   ← 위 파일들을 한 파일로 합친 독립 실행 버전
├── build_standalone.py             ← standalone HTML과 ZIP을 다시 만들어 주는 스크립트
└── README.md                       ← 이 파일
```

## 🔧 코드를 고친 뒤에는 (중요)

`gravity-shift-standalone.html`은 **자동으로 다시 만들어지지 않아요.**
`js/game.js`나 `css/style.css`, `index.html`을 고쳤다면, 반드시 이 폴더에서
아래를 한 번 실행하세요.

```bash
python3 build_standalone.py
```

그러면 ① 고친 내용이 반영된 `gravity-shift-standalone.html`과
② `dist/gravity-shift.zip`이 새로 만들어져요. 스크립트가 만든 ZIP은 파일과
CRC를 스스로 다시 검사해서, 문제가 있으면 알려줘요.

- Python 3만 있으면 되고, 인터넷·추가 설치·다른 폴더 접근은 필요 없어요.
- 스크립트는 이 폴더 안에만 파일을 써요. 폴더째 옮겨도 그대로 동작해요.
- ZIP에는 이 스크립트와 README까지 같이 들어가서, 받은 사람도 바로 고치고
  다시 빌드할 수 있어요.

## 🛠 수정 팁 (Claude와 같이 볼 때)

- **난이도**: `js/game.js` 맨 위 `CFG` — `gravity`(중력 세기), `speedBase`(시작
  속도), `speedRamp`(빨라지는 속도), `gapMin/gapMax`(장애물 간격) 등.
- **색·모양**: `COLORS`와 `css/style.css`.
- **장애물 종류**: `spawnObstacle()` 함수.
- 앱(Pickle) 위젯 안에서는 `pickle.widget`으로 최고 기록을 저장하고 자비스에게
  `flip` / `restart` 명령을 받아요 (`widget.oncommand` 부분). 위젯 번들은
  `python3 build_standalone.py --widget` 옵션으로만 갱신돼요.

## 📜 버전 기록

**v1.2 (2026-11-05) — 효과음 추가**
- Web Audio로 직접 만든 저작권 걱정 없는 효과음 4종:
  중력 반전(위로 뒤집으면 올라가고 아래로는 내려가는 스윕), 별 획득(딩-딩↑
  두 음), 게임 시작(경쾌한 두 번), 충돌·게임 오버(낮아지는 소리 + 둔탁한
  노이즈)
- 소리 끄기: 오른쪽 위 🔊/🔇 버튼 또는 키보드 **M**. 음소거 상태는 저장돼서
  다음에 켜도 유지돼요
- iPhone 등에서 소리가 나려면 첫 탭/키 입력 후 재생돼요(브라우저 자동재생
  금지 때문). 첫 입력에서 오디오를 깨우고, 일시정지 후 돌아와도 다시 잠금을
  풀어요
- 오디오 파일 없이 코드로 만드는 소리라 저장소 크기나 로딩이 늘지 않아요
- 최고 기록 표시를 오른쪽 위 버튼과 안 겹치게 살짝 옮김

**v1.1 (2026-11-04) — 클로드 수정본 합침 + 배포용 ZIP 구성 정리**
- 최대 스크롤 속도 완화: `speedMax` 1.55 → 1.40 (후반부에 장애물이 0.3초
  미만 간격으로 몰려오는 것을 방지)
- 장애물 간격 줄어드는 폭 완화: 간격 축소 한계 0.40 → 0.30
- 시작 화면 캐릭터 위치: 카드 뒤에 겹치던 것을 카드 위쪽(H×0.17)에서
  둥실둥실 떠 있게 수정
- 배포 ZIP에 `build_standalone.py`를 포함하고, 스크립트가 프로젝트 폴더 밖
  (`widgets/`)에 쓰지 않도록 고쳐서 ZIP만 풀어도 그대로 빌드되게 함
- README를 실제 ZIP 구성과 일치하게 수정 (standalone은 자동 재생성 안 됨을 명시)
- 원본 백업: `projects/gravity-shift-backup-v1.zip`

**v1.0 (2026-11-03) — 첫 버전**

## 📤 제출할 때

Game Off 2026은 **게임 코드가 공개된 GitHub 저장소**와 **itch.io 페이지
제출**이 필요해요.

- [x] GitHub 저장소 만들기 / 코드 올리기 (공개 저장소)
  → <https://github.com/cavinty1216/gravity-shift>
  → 브라우저에서 바로 플레이:
    <https://cavinty1216.github.io/gravity-shift/> · <https://gravity-shift-psi.vercel.app/>
- [ ] itch.io 행사 참가 등록 (아직 안 함)
- [ ] itch.io에 게임 업로드 (아직 안 함)

행사 일정은 <https://itch.io/jam/game-off-2026>에서 확인하세요.
