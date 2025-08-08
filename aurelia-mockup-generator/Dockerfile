# ---------- FRONTEND BUILD ----------
FROM node:18-alpine AS frontend
WORKDIR /app/client
COPY client/package*.json ./
RUN npm install
COPY client/ .
RUN npm run build && test -f dist/index.html

# ---------- BACKEND BUILD ----------
FROM node:18-alpine AS backend
WORKDIR /app
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy backend and mockup config
COPY server ./server
COPY mockups.json .

# Copy built frontend into backend's static folder
COPY --from=frontend /app/client/dist ./client/dist
RUN test -f client/dist/index.html

# ---------- RUN APP ----------
WORKDIR /app/server
ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000
CMD ["node", "index.js"]
