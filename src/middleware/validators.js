const Joi = require("joi");

// Deliberately generic messages — don't reveal which field or rule failed
// in a way that would help someone probe the login form specifically.
const loginSchema = Joi.object({
  email: Joi.string().email().max(254).required(),
  password: Joi.string().min(1).max(200).required(),
});

const registerClientSchema = Joi.object({
  username: Joi.string().trim().min(2).max(100).required(),
  email: Joi.string().email().max(254).required(),
  company: Joi.string().trim().max(150).allow("", null),
});

const clientStatusSchema = Joi.object({
  status: Joi.string().valid("active", "suspended").required(),
});

function validateBody(schema) {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { stripUnknown: true });
    if (error) {
      return res.status(400).json({ message: "Invalid input: " + error.details[0].message });
    }
    req.body = value; // sanitized/coerced version only — no unexpected extra fields
    next();
  };
}

module.exports = { loginSchema, registerClientSchema, clientStatusSchema, validateBody };
