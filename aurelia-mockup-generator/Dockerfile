# ---------- FRONTEND BUILD ----------
FROM node:18-alpine as frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build

# ---------- BACKEND BUILD ----------
FROM node:18-alpine as backend
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy backend and mockup config
COPY server ./server
COPY mockups.json .

# Copy built frontend into backend's static folder
COPY --from=frontend /app/client/dist ./client/dist

# ---------- RUN APP ----------
WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
