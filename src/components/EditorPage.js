import React, { useEffect, useState, useRef } from "react";
import ReactQuill, { Quill } from "react-quill";
import "quill/dist/quill.snow.css";
import io from "socket.io-client";
import { useParams, useLocation, useNavigate } from "react-router-dom";
import Delta from "quill-delta";
import toast from "react-hot-toast";
import Client from "../components/Client";
import QuillCursors from "quill-cursors";
import debounce from "lodash/debounce";

Quill.register("modules/cursors", QuillCursors);

/*
const staticDelta = {
  ops: [
    { insert: 'Hello ' },
    { insert: 'World', attributes: { bold: true } },
    { insert: '\nThis is a new line.\n' },
    { insert: 'This is another line with ' },
    { insert: 'italic', attributes: { italic: true } },
    { insert: ' text.\n' }
  ]
};
*/

const EditorPage = () => {
  const { roomId } = useParams();
  const { search } = useLocation();
  const query = new URLSearchParams(search);
  const username = query.get("username");
  const reactNavigator = useNavigate();

  const [socket, setSocket] = useState(null);
  const [documentState, setDocumentState] = useState(null); // New state to keep track of the document state
  const [clients, setClients] = useState([]); // New state for connected clients array

  const quillRef = useRef(null);

  // Define the modules
  const modules = {
    cursors: {
      hideDelayMs: 500,
      hideSpeedMs: 300,
      selectionChangeSource: null,
      transformOnTextChange: true,
    },
    toolbar: [
      [{ header: [1, 2, false] }],
      ["bold", "italic", "underline"],
      ["image", "code-block"],
    ],
  };

  useEffect(() => {
    //Quill initialization
    console.log(
      "1st time copounent rendering. So, Quill REF: " + quillRef.current
    );
    if (quillRef.current) return; //If already set Return i.e Object exists
    const editor = quillRef.current.getEditor();

    editor.setText("Loading...");
    //editor.setContents(staticDelta);  //For Testing
    quillRef.current = editor;
    console.log("1st useEffect For Quill Initialization");
  }, []);

  // -----------------------------------------2nd useEffect()    Starts --------------------------------------------------
  useEffect(() => {
    if (!quillRef.current) {
      console.error("Quill Editor is not initialized yet.");
      return;
    }
    console.log("2nd useEffect");

async function getAvailableServer() {
    const servers = ["http://localhost:5000", "http://13.53.130.167:5000"];
    
    for (const server of servers) {
        try {
            const response = await fetch(server, { method: "HEAD" });
            if (response.ok) {
                return server;
            }
        } catch (error) {
            // Server not reachable, continue to the next one
        }
    }
    throw new Error("No servers are available");
}

let socketInstance;
(async () => {
try {
        const serverUrl = await getAvailableServer();
        socketInstance = io(serverUrl);
        setSocket(socketInstance);
        console.log("Connected to", serverUrl);
} catch (error) {
        console.error(error.message);
}
})();

    socketInstance.on("connect", () => {
      console.log("Socket connected, joining room with ID:", roomId);
      socketInstance.emit("join-room", { roomId, username });
    });

    // Event handlers for user join
    socketInstance.on("user-joined", (username) => {
      if (typeof socket === "undefined") return;
      setClients((prev) => [...prev, username]);

      const color = generateRandomColor();
      const cursors = quillRef.current.getEditor().getModule("cursors");
      const allCursors = cursors.cursors();
      console.log("All available cursors " + JSON.stringify(allCursors));
      if (!allCursors.some((cursor) => cursor.id === username)) {
        cursors.createCursor(username, username, color);
      }

      toast.success(`${username} has joined the room.`);
      socketInstance.emit("connected-users", clients); //Emit User Array
    });

    socketInstance.on("connected-users", handleConnectedUsers);

    socketInstance.on("initialize-document", (documentState) => {
      //console.log("Received document state:", documentState);
      const delta = new Delta(documentState);

      if (typeof documentState === "object" && documentState !== null) {
        quillRef.current.getEditor().setContents(delta, "silent");
        setDocumentState(delta);
      } else {
        console.error(
          "Document state is neither a string nor a valid object:",
          documentState
        );
        quillRef.current.getEditor().setText("Failed to load document.");
      }
      quillRef.current.getEditor().enable();
    });

    socketInstance.on("text-change", (data) => {
      if (data.username !== username) {
        const delta = new Delta(data.delta);
        quillRef.current.getEditor().updateContents(delta, "silent");
        //   console.log("ON text-change " + JSON.stringify(delta));

        setDocumentState((prevState) => {
          if (prevState) {
            const newDocumentState = prevState.compose(delta);
            // console.log("New document state after compose:", newDocumentState);
            return newDocumentState;
          } else {
            console.error("Previous state is undefined.");
            return new Delta(); // Reset to an empty Delta if undefined
          }
        });
      }
    });

    socketInstance.on("user-left", (username) => {
      setClients((prev) => prev.filter((user) => user !== username));

      const cursors = quillRef.current.getEditor().getModule("cursors");
      cursors.removeCursor(username, username);

      toast.success(`${username} has left the room.`);
      socketInstance.emit("connected-users", clients);
    });

    return () => {
      socketInstance.off("user-joined");
      socketInstance.off("connected-users");
      socketInstance.off("initialize-document");
      socketInstance.off("text-change");
      socketInstance.off("user-left");
      socketInstance.disconnect();
      if (quillRef.current)
        //object exists
        quillRef.current.getEditor().off("text-change");
      console.log("Cleaned up on component unmount");
    };
  }, [roomId, username]);

  // -----------------------------------------------------------2nd UseEffect ends--------------------------------------------------------------

  //Function to handle all connected clients
  const handleConnectedUsers = (users) => {
    console.log(`Updated list of connected users: ${users}`);
    setClients(users);
  };

  // Function to handle leaving the room
  const leaveRoom = () => {
    if (!socket) return;
    socket.emit("leave-room", { roomId, username });
    reactNavigator("/");
  };

  // --------------------------------3rd effect ----------------------------------------------
  useEffect(() => {
    if (!socket || !quillRef.current) return;

    const handleTextChange = (delta, oldDelta, source) => {
      if (source !== "user") return;

      let range = quillRef.current.getEditor().getSelection();
      if (range) {
        if (range.length == 0) {
          // User is actively typing, update the cursor position
          socket.emit("cursor-move", { roomId, username, cursorPos: range });
        } else {
          // User made a selection
          console.log("User has made a selection");
        }
      }
      console.log("first", delta);
      socket.emit("text-change", { roomId, username, delta: delta });
      saveCurrentDocumentState();
    };

    const handleSelectionChange = (range) => {
      if (!socket) return;
      socket.emit("cursor-selection", { roomId, username, cursorPos: range });
      console.log("Selection-change of quill: " + JSON.stringify(range)); //{"index":0,"length":0}
    };

    socket.on("remote-cursor-selection", ({ username, cursorPos }) => {
      console.log(
        "Remote cursor selection point for " +
          username +
          " " +
          JSON.stringify(cursorPos)
      );
      const color = generateRandomColor();
      const cursors = quillRef.current.getEditor().getModule("cursors");
      const allCursors = cursors.cursors();
      console.log("ALl cursors " + JSON.stringify(allCursors));
      if (!allCursors.some((cursor) => cursor.id === username)) {
        cursors.createCursor(username, username, color);
      }

      cursors.moveCursor(username, cursorPos); // <== cursor data from previous step
      cursors.toggleFlag(username, true);
    });

    socket.on("remote-cursor-move", ({ username, cursorPos }) => {
      console.log(
        "Remote cursor move for " + username + " " + JSON.stringify(cursorPos)
      );
      const cursors = quillRef.current.getEditor().getModule("cursors");
      cursors.moveCursor(username, cursorPos); // <== cursor data from previous step
      cursors.toggleFlag(username, true);
    });

    quillRef.current.getEditor().on("text-change", handleTextChange);

    quillRef.current
      .getEditor()
      .on("selection-change", (range, oldRange, source) => {
        handleSelectionChange(range);
      });

    return () => {
      socket.off("remote-cursor-selection");
      socket.off("remote-cursor-move");

      if (quillRef.current) {
        quillRef.current.getEditor().off("text-change", handleTextChange);
        quillRef.current.getEditor().off("selection-change");
      }
    };
  }, [socket, roomId, username]);

  // Function to save the current document state to the server
  const saveCurrentDocumentState = () => {
    if (!quillRef.current) return;
    if (quillRef.current) {
      const currentContents = quillRef.current.getEditor().getContents(); // Get the current state of the editor
      const serializedContent = JSON.stringify(currentContents); // Serialize the state
      socket.emit("save-document", { roomId, content: serializedContent });
    }
  };

  // Function to copy room ID to clipboard
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId);
    toast.success("Room ID copied to clipboard!");
  };

  function generateRandomColor() {
    const letters = "0123456789ABCDEF";
    let color = "#";
    for (let i = 0; i < 6; i++) {
      color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
  }

  return (
    <div className="mainWrap">
      <div className="aside">
        <div className="asideInner">
          <div className="logo">
            <img className="logoImage" src="/code-sync_1.png" alt="logo" />
          </div>
          <h3>Connected</h3>
          <div className="clientsList">
            {clients.map((client, index) => (
              <Client
                key={index}
                username={client}
                isCurrentUser={client === username}
              />
            ))}
          </div>
        </div>
        <button className="btn copyBtn" onClick={copyRoomId}>
          Copy ROOM ID
        </button>
        <button className="btn leaveBtn" onClick={leaveRoom}>
          Leave
        </button>
      </div>
      <div className="editorWrap">
        <div className="editor-container" style={{ height: "100vh" }}>
          {" "}
          {/* Ensure the editor container is visible and has a height */}
          <ReactQuill
            ref={quillRef}
            theme="snow"
            modules={modules}
            placeholder="Start collaborating As a Team..."
            style={{ height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
};

export default EditorPage;

// ===========================================
// import React, { useEffect, useState, useRef } from "react";
// import ReactQuill, { Quill } from "react-quill";
// import "quill/dist/quill.snow.css";
// import io from "socket.io-client";
// import { useParams, useLocation, useNavigate } from "react-router-dom";
// import Delta from "quill-delta";
// import toast from "react-hot-toast";
// import Client from "../components/Client";
// import QuillCursors from "quill-cursors";

// Quill.register("modules/cursors", QuillCursors);

// const EditorPage = () => {
//   const { roomId } = useParams();
//   const { search } = useLocation();
//   const query = new URLSearchParams(search);
//   const username = query.get("username");
//   const reactNavigator = useNavigate();

//   const [socket, setSocket] = useState(null);
//   const [clients, setClients] = useState([]);
//   const quillRef = useRef(null);
//   const debounceTimeout = useRef(null);

//   const modules = {
//     cursors: {
//       hideDelayMs: 500,
//       hideSpeedMs: 300,
//     },
//     toolbar: [
//       [{ header: [1, 2, false] }],
//       ["bold", "italic", "underline"],
//       ["image", "code-block"],
//     ],
//   };

//   useEffect(() => {
//     if (quillRef.current) return;
//     const editor = quillRef.current.getEditor();
//     editor.setText("Loading...");
//     quillRef.current = editor;
//   }, []);

//   useEffect(() => {
//     if (!quillRef.current) return;

//     const socketInstance = io("http://localhost:5000");
//     setSocket(socketInstance);

//     socketInstance.on("connect", () => {
//       socketInstance.emit("join-room", { roomId, username });
//     });

//     socketInstance.on("user-joined", (username) => {
//       setClients((prev) => [...prev, username]);
//       handleCursorCreation(username);
//       toast.success(`${username} has joined the room.`);
//     });

//     socketInstance.on("initialize-document", (documentState) => {
//       const delta = new Delta(documentState);
//       quillRef.current.getEditor().setContents(delta, "silent");
//       quillRef.current.getEditor().enable();
//     });

//     socketInstance.on("text-change", (data) => {
//       if (data.username !== username) {
//         const delta = new Delta(data.delta);
//         quillRef.current.getEditor().updateContents(delta, "silent");
//       }
//     });

//     socketInstance.on("user-left", (username) => {
//       setClients((prev) => prev.filter((user) => user !== username));
//       handleCursorRemoval(username);
//       toast.success(`${username} has left the room.`);
//     });

//     return () => {
//       socketInstance.disconnect();
//       if (quillRef.current) {
//         quillRef.current.getEditor().off("text-change");
//       }
//     };
//   }, [roomId, username]);

//   useEffect(() => {
//     if (!socket || !quillRef.current) return;

//     const handleTextChange = (delta, oldDelta, source) => {
//       if (source !== "user") return;

//       if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
//       debounceTimeout.current = setTimeout(() => {
//         socket.emit("text-change", { roomId, username, delta });
//       }, 3000);
//     };

//     quillRef.current.getEditor().on("text-change", handleTextChange);

//     return () => {
//       if (quillRef.current) {
//         quillRef.current.getEditor().off("text-change", handleTextChange);
//       }
//     };
//   }, [socket, roomId, username]);

//   const handleCursorCreation = (username) => {
//     const cursors = quillRef.current.getEditor().getModule("cursors");
//     const existingCursor = cursors
//       .cursors()
//       .find((cursor) => cursor.id === username);
//     if (!existingCursor) {
//       const color = generateRandomColor();
//       cursors.createCursor(username, username, color);
//     }
//   };

//   const handleCursorRemoval = (username) => {
//     const cursors = quillRef.current.getEditor().getModule("cursors");
//     cursors.removeCursor(username);
//   };

//   const generateRandomColor = () => {
//     return `#${Math.floor(Math.random() * 16777215).toString(16)}`;
//   };

//   const leaveRoom = () => {
//     if (socket) {
//       socket.emit("leave-room", { roomId, username });
//     }
//     reactNavigator("/");
//   };

//   return (
//     <div className="mainWrap">
//       <div className="aside">
//         <div className="asideInner">
//           <div className="logo">
//             <img className="logoImage" src="/code-sync_1.png" alt="logo" />
//           </div>
//           <h3>Connected</h3>
//           <div className="clientsList">
//             {clients.map((client, index) => (
//               <Client
//                 key={index}
//                 username={client}
//                 isCurrentUser={client === username}
//               />
//             ))}
//           </div>
//         </div>
//         <button
//           className="btn copyBtn"
//           onClick={() => navigator.clipboard.writeText(roomId)}
//         >
//           Copy ROOM ID
//         </button>
//         <button className="btn leaveBtn" onClick={leaveRoom}>
//           Leave
//         </button>
//       </div>
//       <div className="editorWrap">
//         <ReactQuill
//           ref={quillRef}
//           theme="snow"
//           modules={modules}
//           placeholder="Start collaborating as a team..."
//           style={{ height: "100%" }}
//         />
//       </div>
//     </div>
//   );
// };

// export default EditorPage;
