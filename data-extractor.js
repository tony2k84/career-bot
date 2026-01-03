const fs = require('node:fs');
const { parse } = require('csv-parse/sync');

function getCSVContent(fileName) {
  const csvContent = fs.readFileSync(fileName, 'utf-8');
  const records = parse(csvContent, {
    columns: true,
    skip_empty_lines: true,
  });
  return records;
}

// Create a text combining all relevant information from required files
function getContent() {
  const certifications = getCSVContent('data/Certifications.csv');
  const companyFollows = getCSVContent('data/Company Follows.csv');
  const connections = getCSVContent('data/Connections.csv');
  const education = getCSVContent('data/Education.csv');
  const emails = getCSVContent('data/Email Addresses.csv');
  const endorsementsGiven = getCSVContent('data/Endorsement_Given_Info.csv');
  const endorsementsReceived = getCSVContent(
    'data/Endorsement_Received_Info.csv'
  );
  const languages = getCSVContent('data/Languages.csv');
  const learningCourses = getCSVContent('data/Learning.csv');
  const patents = getCSVContent('data/Patents.csv');
  const phoneNumbers = getCSVContent('data/PhoneNumbers.csv');
  const positions = getCSVContent('data/Positions.csv');
  const profileSummary = getCSVContent('data/Profile Summary.csv');
  const profile = getCSVContent('data/Profile.csv');
  const projects = getCSVContent('data/Projects.csv');
  const recommendationsGiven = getCSVContent('data/Recommendations_Given.csv');
  const recommendationsReceived = getCSVContent(
    'data/Recommendations_Received.csv'
  );
  const skills = getCSVContent('data/Skills.csv');

  let textContents = [];

  textContents.push(
    `Profile:\n${profile[0]['First Name']} ${profile[0]['Last Name']}. ${profile[0]['Summary']}`
  );

  textContents.push(
    `Certifications(Name,Authority,Date):\n${certifications
      .map((c) => `- ${c.Name},${c.Authority},${c['Started On']}`)
      .join('\n')}`
  );
  textContents.push(
    `Company Follows(Organization,Date):\n${companyFollows
      .map((c) => `- ${c.Organization},${c['Followed On']}`)
      .join('\n')}`
  );
  textContents.push(
    `Connections(Name):\n${connections
      .map((c) => `- ${c['First Name']} ${c['Last Name']}`)
      .join('\n')}`
  );

  textContents.push(
    `Education(Degree,Type,School,Date):\n${education
      .map(
        (c) =>
          `- ${c['Degree Name']},${c['Notes']},${c['School Name']},${c['Start Date']} - ${c['End Date']}`
      )
      .join('\n')}`
  );

  textContents.push(
    `Emails:\n${emails.map((c) => `- ${c['Email Address']}`).join('\n')}`
  );

  textContents.push(
    `Languages(Name,Proficiency):\n${languages
      .map((c) => `- ${c['Name']},${c['Proficiency']}`)
      .join('\n')}`
  );
  textContents.push(
    `Courses(Title,Description,Date):\n${learningCourses
      .filter((c) => c['Content Completed At (if completed)'].trim() !== 'N/A')
      .map(
        (c) =>
          `- ${c['Content Title']},${c['Content Description']},${c['Content Completed At (if completed)']}`
      )
      .join('\n')}`
  );

  textContents.push(
    `Patents(Title,Description,Date):\n${patents
      .map((c) => `- ${c['Title']},${c['Description']},${c['Issued On']}`)
      .join('\n')}`
  );

  textContents.push(
    `Positions / Roles(Company Name, Title, Description, Date):\n${positions
      .map(
        (c) =>
          `- ${c['Company Name']},${c['Title']},${c['Description']},${c['Started On']} - ${c['Finished On']}`
      )
      .join('\n')}`
  );

  textContents.push(
    `Projects(Title, Description, Date):\n${projects
      .map(
        (c) =>
          `- ${c['Title']},${c['Description']},${c['Started On']} - ${c['Finished On']}`
      )
      .join('\n')}`
  );

  textContents.push(
    `Recommendations Received(From, Recommendation, Date):\n${recommendationsReceived
      .filter((c) => c['Status'].trim() === 'VISIBLE')
      .map(
        (c) =>
          `- ${c['First Name']} ${c['Last Name']},${c['Text']},${c['Creation Date']}`
      )
      .join('\n')}`
  );
  textContents.push(
    `Skills:\n${skills.map((c) => `- ${c['Name']}`).join('\n')}`
  );

  const textContent = textContents.join('\n\n');

  // console.log(textContent);
  // console.log(endorsementsGiven[0]);
  // console.log(endorsementsReceived[0]);
  // console.log(phoneNumbers[0]);
  // console.log(positions[0]);
  // console.log(profileSummary);
  // console.log(recommendationsGiven[0]);
  // console.log(recommendationsReceived[0]);

  return textContent;
}

module.exports = { getContent };
