"use strict";

const { createApp } = require("./server");

const PORT = process.env.PORT || 3000;
const app = createApp();

app.listen(PORT, () => {
  console.log(`Ask the ERP listening on port ${PORT}`);
});
