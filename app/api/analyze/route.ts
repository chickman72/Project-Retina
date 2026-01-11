import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing image file." }, { status: 400 });
  }

  const endpoint = process.env.AZURE_VISION_ENDPOINT;
  const key = process.env.AZURE_VISION_KEY;
  const projectId = process.env.AZURE_PROJECT_ID;
  const iterationName = process.env.AZURE_ITERATION_NAME;

  if (!endpoint || !key || !projectId || !iterationName) {
    return NextResponse.json(
      { error: "Azure Custom Vision environment variables are missing." },
      { status: 500 },
    );
  }

  const url = `${endpoint.replace(
    /\/+$/,
    "",
  )}/customvision/v3.0/Prediction/${projectId}/classify/iterations/${iterationName}/image`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Prediction-Key": key,
      "Content-Type": "application/octet-stream",
    },
    body: await file.arrayBuffer(),
  });

  const data = await response.json();

  if (!response.ok) {
    return NextResponse.json(
      { error: data?.message ?? "Azure Custom Vision request failed." },
      { status: response.status },
    );
  }

  return NextResponse.json(data);
}
