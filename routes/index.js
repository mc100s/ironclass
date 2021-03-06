const express = require("express");
const User = require("../models/User");
const Class = require("../models/Class");
const MixMyClass = require("../src/MixMyClass");
const CallQueue = require("../src/CallQueue");
const { isConnected } = require("../src/middlewares");

// SOCKET.IO
const {
  updateCourse,
  queueStudent,
  dequeueStudent,
  sudoDequeueStudent
} = require("../src/socketAPI");

const router = express.Router();
// HOME PAGE
router.get("/", (req, res, next) => {
  res.render("index");
});

// ------ C l a s s r o o m ------
router.get("/classroom", isConnected, (req, res, next) => {
  let user = req.user;
  let _class = req.user._class;

  Promise.all([User.find({ _class }), Class.findById(_class).populate("_callQueue")])
    .then(([users,theClass]) => {
      let students = users.filter(user => user.role === "Student");

      let groups = theClass.currentGroups;
      let queue = theClass._callQueue;
      let currentCourse = theClass.currentCourse;
      let queueObj = queue.reverse();

      res.render("classroom", { students, groups, queueObj, currentCourse, user });
    })
    .catch(next);
});

// CURRENT COURSE
router.post("/classroom", isConnected, (req, res, next) => {
  let _class = req.user._class;
  let currentCourse = req.body.currentCourse;
  if (currentCourse === "") {
    currentCourse = "Click me!";
  }
  updateCourse(currentCourse);

  Class.findByIdAndUpdate(_class, { currentCourse })
    .then(() => {
      res.redirect("/classroom");
    })
    .catch(next);
});

// CREATE GROUPS
router.post("/classroom/create-groups", isConnected, (req, res, next) => {
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      // let students = values[0].filter(user => user.role === "Student");
      let myClass = new MixMyClass(values[0], values[1][0]);
      const { groupSize, notPresent, option } = req.body;
      let groups = myClass.createGroups(groupSize, notPresent, option);
      // console.log("TCL: groups", groups);

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

      Class.findByIdAndUpdate(_class, { currentGroups: groups })
        .then(() => {
          console.log("_currentGroups updated!");
          res.redirect("/classroom");
        })
        .catch(next);

      // HERE I NEED TO UPDATE _currentGroups ARRAY
      // AND THEN REDIRECT TO /classroom

      // res.render("classroom", { students, groups });
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
      let newCallQueue = new CallQueue(values[0], values[1][0]);
      let queueBefore = newCallQueue.queue.map(obj => obj.toString());
      newCallQueue.wave(req.user);
      let queue = newCallQueue.queue;
      Class.findByIdAndUpdate(_class, { _callQueue: queue })
        .then(() => {
          console.log("Classes _callQueue updated");
          if (req.user.role === "Student" && !queueBefore.includes(req.user._id.toString())) {
            let firstName = req.user.firstName;
            let id = req.user._id;
            // UPDATE VIA DOM
            queueStudent(firstName, id);
          }
          res.redirect("/classroom");
        })
        .catch(next);
    })
    .catch(next);
});
router.get("/classroom/queue-tick/:studentId", isConnected, (req, res, next) => {
  let studentId = req.params.studentId;
  console.log("TCL: studentId", studentId);
  let _class = req.user._class;
  Promise.all([User.find(), Class.find({ _id: _class })])
    .then(values => {
      let newCallQueue = new CallQueue(values[0], values[1][0]);
      if (studentId === "n-a") {
        newCallQueue.tick(req.user);
        dequeueStudent();
      } else if (req.user.role != "Student" || req.user._id.toString() === studentId) {
        newCallQueue.sudoTick(req.user, studentId);
        sudoDequeueStudent(studentId);
      }
      let queue = newCallQueue.queue;
      Class.findByIdAndUpdate(_class, { _callQueue: queue })
        .then(() => {
          console.log("Classes _callQueue updated");
          res.redirect("/classroom");
        })
        .catch(next);
    })
    .catch(next);
});

module.exports = router;
