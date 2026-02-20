FROM node:22-slim

ADD ["./package.json", "./package-lock.json", "/app/"]
WORKDIR /app
RUN npm ci

ADD [".", "/app/"]
RUN npm run build

EXPOSE 3000
CMD ["node", "dist/main.js"]
USER node
