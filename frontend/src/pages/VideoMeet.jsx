import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from "socket.io-client";
import { Badge, IconButton, TextField, Button } from '@mui/material';
import VideocamIcon from '@mui/icons-material/Videocam';
import VideocamOffIcon from '@mui/icons-material/VideocamOff';
import CallEndIcon from '@mui/icons-material/CallEnd';
import MicIcon from '@mui/icons-material/Mic';
import MicOffIcon from '@mui/icons-material/MicOff';
import ScreenShareIcon from '@mui/icons-material/ScreenShare';
import StopScreenShareIcon from '@mui/icons-material/StopScreenShare';
import ChatIcon from '@mui/icons-material/Chat';
import styles from "../styles/videoComponent.module.css";
import server from '../environment';

const server_url = server;

var connections = {};

const peerConfigConnections = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
}

export default function VideoMeetComponent() {
  const socketRef = useRef();
  const socketIdRef = useRef();

  const localVideoref = useRef();

  const [videoAvailable, setVideoAvailable] = useState(true);
  const [audioAvailable, setAudioAvailable] = useState(true);

  const [video, setVideo] = useState(true);
  const [audio, setAudio] = useState(true);

  const [screen, setScreen] = useState(false);

  const [screenAvailable, setScreenAvailable] = useState(false);

  const [messages, setMessages] = useState([]);
  const [message, setMessage] = useState("");

  const [newMessages, setNewMessages] = useState(0);

  const [askForUsername, setAskForUsername] = useState(true);
  const [username, setUsername] = useState("");

  const videoRef = useRef([]);
  const [videos, setVideos] = useState([]);

  // Fix: wrap in useCallback to avoid warnings
  const getPermissions = useCallback(async () => {
    try {
      const videoPermission = await navigator.mediaDevices.getUserMedia({ video: true });
      setVideoAvailable(!!videoPermission);

      const audioPermission = await navigator.mediaDevices.getUserMedia({ audio: true });
      setAudioAvailable(!!audioPermission);

      setScreenAvailable(!!navigator.mediaDevices.getDisplayMedia);

      if (videoAvailable || audioAvailable) {
        const userMediaStream = await navigator.mediaDevices.getUserMedia({ video: videoAvailable, audio: audioAvailable });
        if (userMediaStream) {
          window.localStream = userMediaStream;
          if (localVideoref.current) {
            localVideoref.current.srcObject = userMediaStream;
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  }, [videoAvailable, audioAvailable]);

  useEffect(() => {
    getPermissions();
  }, [getPermissions]);

  // Simplified getUserMediaSuccess (optional enhancement)
  const getUserMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach(track => track.stop());
    } catch (e) {}

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    // Update connections with new tracks
    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      stream.getTracks().forEach(track => {
        connections[id].addTrack(track, stream);
      });

      connections[id].createOffer().then(description => {
        connections[id].setLocalDescription(description).then(() => {
          socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription }));
        }).catch(console.error);
      });
    }

    stream.getTracks().forEach(track => {
      track.onended = () => {
        setVideo(false);
        setAudio(false);

        try {
          let tracks = localVideoref.current.srcObject.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) {}

        // Replace local stream with silence/black
        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
        window.localStream = blackSilence();
        if (localVideoref.current) {
          localVideoref.current.srcObject = window.localStream;
        }

        for (let id in connections) {
          window.localStream.getTracks().forEach(track => {
            connections[id].addTrack(track, window.localStream);
          });

          connections[id].createOffer().then(description => {
            connections[id].setLocalDescription(description).then(() => {
              socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription }));
            }).catch(console.error);
          });
        }
      };
    });
  };

  // Function to get user media (video/audio)
  const getUserMedia = useCallback(() => {
    if ((video && videoAvailable) || (audio && audioAvailable)) {
      navigator.mediaDevices.getUserMedia({ video: video, audio: audio })
        .then(getUserMediaSuccess)
        .catch(console.error);
    } else {
      try {
        let tracks = localVideoref.current.srcObject.getTracks();
        tracks.forEach(track => track.stop());
      } catch (e) {}
    }
  }, [video, audio, videoAvailable, audioAvailable]);

  useEffect(() => {
    getUserMedia();
  }, [getUserMedia]);

  // Function to get display media for screen sharing
  const getDisplayMedia = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      getDisplayMediaSuccess(stream);
    } catch (error) {
      console.log("Error getting display media", error);
      setScreen(false);
    }
  }, []);

  // Handle success of display media (screen share)
  const getDisplayMediaSuccess = (stream) => {
    try {
      window.localStream.getTracks().forEach(track => track.stop());
    } catch (e) {}

    window.localStream = stream;
    if (localVideoref.current) {
      localVideoref.current.srcObject = stream;
    }

    for (let id in connections) {
      if (id === socketIdRef.current) continue;

      stream.getTracks().forEach(track => {
        connections[id].addTrack(track, stream);
      });

      connections[id].createOffer().then(description => {
        connections[id].setLocalDescription(description).then(() => {
          socketRef.current.emit('signal', id, JSON.stringify({ sdp: connections[id].localDescription }));
        }).catch(console.error);
      });
    }

    stream.getTracks().forEach(track => {
      track.onended = () => {
        setScreen(false);

        try {
          let tracks = localVideoref.current.srcObject.getTracks();
          tracks.forEach(track => track.stop());
        } catch (e) {}

        let blackSilence = (...args) => new MediaStream([black(...args), silence()]);
        window.localStream = blackSilence();
        if (localVideoref.current) {
          localVideoref.current.srcObject = window.localStream;
        }

        getUserMedia();
      };
    });
  };

  // Silence and black helpers for empty media streams
  const silence = () => {
    let ctx = new AudioContext();
    let oscillator = ctx.createOscillator();
    let dst = oscillator.connect(ctx.createMediaStreamDestination());
    oscillator.start();
    ctx.resume();
    return Object.assign(dst.stream.getAudioTracks()[0], { enabled: false });
  };

  const black = ({ width = 640, height = 480 } = {}) => {
    let canvas = Object.assign(document.createElement("canvas"), { width, height });
    canvas.getContext('2d').fillRect(0, 0, width, height);
    let stream = canvas.captureStream();
    return Object.assign(stream.getVideoTracks()[0], { enabled: false });
  };

  // Signal message handler
  const gotMessageFromServer = (fromId, message) => {
    const signal = JSON.parse(message);

    if (fromId !== socketIdRef.current) {
      if (signal.sdp) {
        connections[fromId].setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
          if (signal.sdp.type === 'offer') {
            connections[fromId].createAnswer().then(description => {
              connections[fromId].setLocalDescription(description).then(() => {
                socketRef.current.emit('signal', fromId, JSON.stringify({ sdp: connections[fromId].localDescription }));
              }).catch(console.error);
            }).catch(console.error);
          }
        }).catch(console.error);
      }

      if (signal.ice) {
        connections[fromId].addIceCandidate(new RTCIceCandidate(signal.ice)).catch(console.error);
      }
    }
  };

  // Connect to signaling server and setup listeners
  const connectToSocketServer = () => {
    socketRef.current = io.connect(server_url, { secure: false });

    socketRef.current.on('signal', gotMessageFromServer);

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join-call', window.location.href);
      socketIdRef.current = socketRef.current.id;

      socketRef.current.on('chat-message', addMessage);

      socketRef.current.on('user-left', (id) => {
        setVideos(videos => videos.filter(video => video.socketId !== id));
        if (connections[id]) {
          connections[id].close();
          delete connections[id];
        }
      });

      socketRef.current.on('user-joined', (id, clients) => {
        clients.forEach((socketListId) => {
          if (socketListId === socketIdRef.current) return; // Skip local user

          if (!connections[socketListId]) {
            connections[socketListId] = new RTCPeerConnection(peerConfigConnections);

            connections[socketListId].onicecandidate = (event) => {
              if (event.candidate) {
                socketRef.current.emit('signal', socketListId, JSON.stringify({ ice: event.candidate }));
              }
            };

            connections[socketListId].ontrack = (event) => {
              const remoteStream = event.streams[0];
              setVideos(videos => {
                const videoExists = videos.find(video => video.socketId === socketListId);
                if (videoExists) {
                  return videos.map(video =>
                    video.socketId === socketListId ? { ...video, stream: remoteStream } : video
                  );
                } else {
                  return [...videos, { socketId: socketListId, stream: remoteStream }];
                }
              });
            };

            if (window.localStream) {
              window.localStream.getTracks().forEach(track => {
                connections[socketListId].addTrack(track, window.localStream);
              });
            }
          }
        });

        if (id === socketIdRef.current) {
          for (let id2 in connections) {
            if (id2 === socketIdRef.current) continue;

            try {
              window.localStream.getTracks().forEach(track => {
                connections[id2].addTrack(track, window.localStream);
              });
            } catch (e) {}

            connections[id2].createOffer().then(description => {
              connections[id2].setLocalDescription(description).then(() => {
                socketRef.current.emit('signal', id2, JSON.stringify({ sdp: connections[id2].localDescription }));
              }).catch(console.error);
            });
          }
        }
      });
    });
  };

  // Chat message handlers
  const addMessage = (data, sender, socketIdSender) => {
    setMessages(prevMessages => [...prevMessages, { sender, data }]);
    if (socketIdSender !== socketIdRef.current) {
      setNewMessages(prevNewMessages => prevNewMessages + 1);
    }
  };

  const sendMessage = () => {
    if (message.trim() !== "") {
      socketRef.current.emit('chat-message', message, username);
      setMessage("");
    }
  };

  // Button handlers
  const handleVideo = () => setVideo(prev => !prev);
  const handleAudio = () => setAudio(prev => !prev);
  const handleScreen = () => setScreen(prev => !prev);
  const handleEndCall = () => {
    try {
      let tracks = localVideoref.current.srcObject.getTracks();
      tracks.forEach(track => track.stop());
    } catch (e) {}
    window.location.href = "/";
  };

  // Connect and initialize media and signaling
  const connect = () => {
    setAskForUsername(false);
    getUserMedia();
    connectToSocketServer();
  };

  // React to screen sharing toggle
  useEffect(() => {
    if (screen) {
      getDisplayMedia();
    }
  }, [screen, getDisplayMedia]);

  return (
    <div>
      {askForUsername ?
        <div>
          <h2>Enter into Lobby </h2>
          <TextField label="Username" value={username} onChange={e => setUsername(e.target.value)} variant="outlined" />
          <Button variant="contained" onClick={connect}>Connect</Button>
          <div>
            {/* Local video preview before joining */}
            <video ref={localVideoref} autoPlay muted playsInline className={styles.meetUserVideo}></video>
          </div>
        </div>
        :
        <div className={styles.meetVideoContainer}>
          {/* Chat modal */}
          {/* ... Your chat modal code here (omitted for brevity) */}

          <div className={styles.buttonContainers}>
            <IconButton onClick={handleVideo} style={{ color: "white" }}>
              {video ? <VideocamIcon /> : <VideocamOffIcon />}
            </IconButton>
            <IconButton onClick={handleEndCall} style={{ color: "red" }}>
              <CallEndIcon />
            </IconButton>
            <IconButton onClick={handleAudio} style={{ color: "white" }}>
              {audio ? <MicIcon /> : <MicOffIcon />}
            </IconButton>
            {screenAvailable && (
              <IconButton onClick={handleScreen} style={{ color: "white" }}>
                {screen ? <ScreenShareIcon /> : <StopScreenShareIcon />}
              </IconButton>
            )}
            <Badge badgeContent={newMessages} max={999} color="warning">
              <IconButton onClick={() => {/* your toggle chat modal */}} style={{ color: "white" }}>
                <ChatIcon />
              </IconButton>
            </Badge>
          </div>

          {/* Local video */}
          <video
            ref={localVideoref}
            autoPlay
            muted
            playsInline
            className={styles.meetUserVideo}
          ></video>

          {/* Remote videos */}
          <div className={styles.conferenceView}>
            {videos
              .filter(video => video.socketId !== socketIdRef.current) // Exclude local video
              .map(video => (
                <div key={video.socketId}>
                  <video
                    data-socket={video.socketId}
                    ref={ref => {
                      if (ref && video.stream) {
                        ref.srcObject = video.stream;
                      }
                    }}
                    autoPlay
                    playsInline
                    muted={false}
                    style={{ width: "40vw", borderRadius: "10px" }}
                  />
                </div>
              ))}
          </div>
        </div>
      }
    </div>
  );
}
