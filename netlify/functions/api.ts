import serverless from "serverless-http";
import { createServer } from "../../server";

let serverlessHandler: any;

export const handler = async (event: any, context: any) => {
  try {
    if (!serverlessHandler) {
      const app = await createServer();
      serverlessHandler = serverless(app);
    }
    return await serverlessHandler(event, context);
  } catch (error: any) {
    console.error("Function error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message || "Internal Server Error" })
    };
  }
};
