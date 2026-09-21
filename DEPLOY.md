# 대시보드 EC2 배포 가이드 (역할4)

장수정 확인 기준: `zw-korea-vpc` 안 App 서브넷(`zw-korea-app-a` 또는 `zw-korea-app-c`)에 올리고,
보안그룹은 `zw-dashboard-sg` 신규 생성해서 붙인다.

## 0. 사전 준비 (AWS 콘솔 / 장수정 확인 필요)

- [ ] EC2 인스턴스를 `zw-korea-app-a` 또는 `zw-korea-app-c` 서브넷에 생성
- [ ] 보안그룹 `zw-dashboard-sg` 생성 후 인스턴스에 연결
  - 인바운드: SSM 접근용 규칙(팀 기존 패턴 따름, 포트 22 직접 개방 X)
  - 아웃바운드: ALB(`zw-alb-sg`)로 나가는 443 허용 (기본 all outbound면 별도 설정 불필요)
- [ ] Node.js 20.x, git, pm2 설치
  ```bash
  curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -   # Amazon Linux 기준, Ubuntu면 deb 스크립트
  sudo yum install -y nodejs git
  sudo npm install -g pm2
  ```

## 1. 코드 배포

```bash
cd /home/ec2-user
git clone <레포 주소> zw-dashboard
cd zw-dashboard/dashboard
npm install
```

## 2. 환경변수 설정

`.env.local` 파일을 EC2에 직접 생성 (git에 커밋된 값은 예시일 뿐이므로 운영 값으로 덮어쓰기):

```bash
cat > .env.local << 'EOF'
NEXT_PUBLIC_SOCKET_URL=https://zw-korea-alb-1001485199.ap-northeast-2.elb.amazonaws.com
NEXT_PUBLIC_API_BASE_URL=https://zw-korea-alb-1001485199.ap-northeast-2.elb.amazonaws.com
NEXT_PUBLIC_FORCE_MOCK=false
EOF
```

⚠️ `NEXT_PUBLIC_*` 값은 빌드 시점에 클라이언트 번들에 박히므로, 값을 바꾸면 반드시 재빌드해야 함.

## 3. 빌드 & 실행

```bash
npm run build
pm2 start ecosystem.config.js
pm2 save          # 재부팅 시에도 자동 시작되게
pm2 startup       # 안내에 따라 systemd 등록 명령 실행
```

## 4. 동작 확인 (SSM 포트포워딩, 로컬 PC에서)

```bash
aws ssm start-session \
  --target <인스턴스ID> \
  --document-name AWS-StartPortForwardingSession \
  --parameters '{"portNumber":["3000"],"localPortNumber":["3000"]}' \
  --profile zw-jbu
```
브라우저에서 `http://localhost:3000` 접속해서 대시보드 뜨는지 확인.

## 5. 재배포(코드 수정 후)

```bash
cd /home/ec2-user/zw-dashboard/dashboard
git pull
npm install        # package.json 변경 있을 때만
npm run build
pm2 restart zw-dashboard
```

## 트러블슈팅

- **`next: Permission denied`**: `chmod +x node_modules/.bin/next` 후 재시도
- **포트 3000이 이미 사용 중**: `pm2 list`로 기존 프로세스 확인 후 `pm2 delete zw-dashboard`
- **빌드는 되는데 소켓 연결이 안 됨**: `.env.local`의 `NEXT_PUBLIC_SOCKET_URL`이 `https://`로 시작하는지,
  재빌드를 했는지 확인 (환경변수는 빌드 타임에 박히므로 `.env.local`만 바꾸고 재빌드 안 하면 반영 안 됨)
