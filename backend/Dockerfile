FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
RUN npx prisma generate
EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && npm run db:seed && npm run dev"]
