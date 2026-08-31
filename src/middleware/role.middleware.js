// Use after `protect` on routes that only certain roles should reach, e.g.
// router.post("/import", protect, authorize("admin", "warehouse_manager"), importExcel)
function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: "You don't have permission to do this." });
    }
    next();
  };
}

module.exports = { authorize };
