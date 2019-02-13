const express = require("express");
const User = require("../models/User");
const Class = require("../models/Class");
const MixMyClass = require("../src/MixMyClass");
const CallQueue = require("../src/CallQueue");
const { isConnected } = require("../src/middlewares");

// SOCKET.IO
const { io, sendMessage, queueStudent, dequeueStudent } = require("../src/socketAPI");

const router = express.Router();
// HOME PAGE
router.get("/", (req, res, next) => {
  res.render("index");
});

// ------ C l a s s r o o m ------
router.get("/classroom", isConnected, (req, res, next) => {
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      let students = values[0].filter(user => user.role === "Student");
      let newMixMyClass = new MixMyClass(values[0], values[1][0]);
      let newCallQueue = new CallQueue(values[0], values[1][0]);
      let groups = newMixMyClass.currentGroups;
      // console.log("TCL: groups", groups);
      let queue = newCallQueue.queue;

      Class.findByIdAndUpdate(_class, { _callQueue: queue, _currentGroups: groups })
        .populate("_currentGroups")
        .populate("_callQueue")
        .then(classes => {
          let queueObj = classes._callQueue.reverse();
          res.render("classroom", { students, groups, queueObj });
        })
        .catch(next);
      // res.send(queue);
    })
    .catch(next);
});
// SENDMESSAGE NEEDS TO BE IMPLEMENTED ON CLICK EVENT
router.post("/classroom", isConnected, (req, res, next) => {
  let msg = req.body.msg;
  sendMessage(msg);
  // res.redirect("/classroom");
  // setTimeout(() => sendMessage(msg), 500);
});

// CREATE GROUPS
router.post("/classroom/create-groups", isConnected, (req, res, next) => {
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      let students = values[0].filter(user => user.role === "Student");
      let myClass = new MixMyClass(values[0], values[1][0]);
      const { groupSize, notPresent, option } = req.body;
      let groups = myClass.createGroups(groupSize, notPresent, option);

      groups.forEach(group => {
        group.forEach(student => {
          User.findByIdAndUpdate(student._id, {
            _workedWith: student._workedWith
          })
            .then(() => {
              // console.log("Student's _workedWith updated");
            })
            .catch(next);
        });
      });

      // HERE I NEED TO UPDATE _currentGroups ARRAY
      // AND THEN REDIRECT TO /classroom

      res.render("classroom", { students, groups });
    })
    .catch(next);
});
router.get("/classroom/reset-worked-with", isConnected, (req, res, next) => {
  User.updateMany({}, { $unset: { _workedWith: "" } })
    .then(() => {
      res.redirect("/classroom");
    })
    .catch(next);
});

// CALLQUEUE
router.get("/classroom/queue-wave", isConnected, (req, res, next) => {
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      // let students = values[0].filter(user => user.role === "Student");
      let newCallQueue = new CallQueue(values[0], values[1][0]);
      let queueBefore = newCallQueue.queue.map(obj => obj.toString());
      // if (!queueBefore.includes(req.user._id.toString())) {
      //   // UPDATE VIA DB
      // }
      newCallQueue.wave(req.user);
      let queue = newCallQueue.queue;
      Class.findByIdAndUpdate(_class, { _callQueue: queue })
        .then(() => {
          console.log("Classes _callQueue updated");
          if (req.user.role === "Student" && !queueBefore.includes(req.user._id.toString())) {
            let fullName = req.user.firstName + " " + req.user.lastName;
            // UPDATE VIA DOM
            queueStudent(fullName);
          }
          res.redirect("/classroom");
        })
        .catch(next);
      // res.send(queue);
    })
    .catch(next);
});
router.get("/classroom/queue-tick", isConnected, (req, res, next) => {
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      // let students = values[0].filter(user => user.role === "Student");
      let newCallQueue = new CallQueue(values[0], values[1][0]);
      newCallQueue.tick(req.user);
      let queue = newCallQueue.queue;
      Class.findByIdAndUpdate(_class, { _callQueue: queue })
        .then(() => {
          console.log("Classes _callQueue updated");
          if (req.user.role != "Student") {
            dequeueStudent();
          }
          res.redirect("/classroom");
        })
        .catch(next);
      // res.send(queue);
    })
    .catch(next);
});

module.exports = router;
