FROM node:18-alpine
WORKDIR /app

# copy package files first for better caching
COPY package*.json ./

# install all dependencies including types in one step
RUN npm install && npm install --save-dev @types/react @types/react-dom @types/node

# copy source code
COPY . .

# set environment variable for backend URL
ENV NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# expose port and start the application in development mode
EXPOSE 3000
CMD ["npm", "run", "dev"]
