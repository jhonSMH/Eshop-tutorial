const socketIO = require("socket.io");
const http = require("http");
const express = require("express");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid"); // Para generar IDs únicos
const app = express();
const server = http.createServer(app);

require("dotenv").config({
  path: "./.env",
});

// Configuración de CORS tanto para Express como para Socket.IO
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Hello world from socket server!");
});

// Configuración de CORS para Socket.IO
const io = socketIO(server, {
  cors: {
    origin: "http://localhost:3000", // Cambia a la URL correcta si es otra
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
    credentials: true,
  },
});

let users = [];

// Funciones para manejar usuarios conectados
const addUser = (userId, socketId) => {
  if (!users.some((user) => user.userId === userId)) {
    users.push({ userId, socketId });
  }
};

const removeUser = (socketId) => {
  users = users.filter((user) => user.socketId !== socketId);
};

const getUser = (receiverId) => {
  return users.find((user) => user.userId === receiverId);
};

// Función para crear un mensaje con un ID único y una propiedad "seen"
const createMessage = ({ senderId, receiverId, text, images }) => ({
  id: uuidv4(), // Genera un ID único para cada mensaje
  senderId,
  receiverId,
  text,
  images,
  seen: false,
});

// Almacena mensajes en memoria (en producción podrías usar una base de datos)
const messages = {};

io.on("connection", (socket) => {
  console.log(`A user is connected`);

  // Cuando un usuario se conecta, toma su userId y socketId
  socket.on("addUser", (userId) => {
    addUser(userId, socket.id);
    io.emit("getUsers", users);
  });

  // Enviar y recibir mensajes
  socket.on("sendMessage", ({ senderId, receiverId, text, images }) => {
    const message = createMessage({ senderId, receiverId, text, images });
    const user = getUser(receiverId);

    // Almacenar los mensajes para cada receptor
    if (!messages[receiverId]) {
      messages[receiverId] = [message];
    } else {
      messages[receiverId].push(message);
    }

    // Enviar el mensaje al receptor si está conectado
    if (user && user.socketId) {
      io.to(user.socketId).emit("getMessage", message);
    } else {
      console.log("User not connected, storing message for later delivery.");
    }
  });

  // Marcar un mensaje como visto
  socket.on("messageSeen", ({ senderId, receiverId, messageId }) => {
    const user = getUser(senderId);

    if (messages[senderId]) {
      const message = messages[senderId].find(
        (message) => message.receiverId === receiverId && message.id === messageId
      );
      if (message) {
        message.seen = true;

        // Notificar al remitente que el mensaje ha sido visto
        if (user && user.socketId) {
          io.to(user.socketId).emit("messageSeen", {
            senderId,
            receiverId,
            messageId,
          });
        }
      }
    }
  });

  // Actualizar y obtener el último mensaje
  socket.on("updateLastMessage", ({ lastMessage, lastMessagesId }) => {
    io.emit("getLastMessage", {
      lastMessage,
      lastMessagesId,
    });
  });

  // Cuando un usuario se desconecta
  socket.on("disconnect", () => {
    console.log(`A user disconnected!`);
    removeUser(socket.id);
    io.emit("getUsers", users);
  });
});

// Iniciar el servidor en el puerto 4000 o el puerto definido en el archivo .env
server.listen(process.env.PORT || 4000, () => {
  console.log(`Server is running on port ${process.env.PORT || 4000}`);
});
