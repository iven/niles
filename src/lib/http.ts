import ky from "ky";

export const http = ky.create({
  headers: {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  },
  timeout: 10000,
  retry: {
    limit: 1,
    methods: ["get", "head"],
    statusCodes: [],
  },
  redirect: "follow",
});
