FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DB_FILE=/app/data/palaute.db
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY src ./src
COPY public ./public
VOLUME /app/data
EXPOSE 3000
CMD ["node", "--no-warnings=ExperimentalWarning", "server.js"]
