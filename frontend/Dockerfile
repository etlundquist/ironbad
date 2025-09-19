FROM node:18-alpine
WORKDIR /app

# install dependencies
COPY package*.json ./
RUN npm install

# copy source code and build the application
COPY . .
RUN npm run build

# expose port and start the application in development mode
EXPOSE 3000
CMD ["npm", "run", "dev"]
