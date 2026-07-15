FROM node:22-alpine

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy the rest of the application files
COPY . .

# Build the React production assets
RUN npm run build

# Expose port 4000
EXPOSE 4000

# Start Vite preview server hosting the production build
CMD ["npm", "run", "preview", "--", "--host", "0.0.0.0", "--port", "4000"]
